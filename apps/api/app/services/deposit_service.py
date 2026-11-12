"""Verdict-gated supplier deposits through PayPal.

The verification report decides what the buyer's money may do, and the server reads that decision itself (never from
the browser):

* PROCEED      → pay now. PayPal Orders v2 with intent CAPTURE, paid straight to the supplier's PayPal account when the
                 buyer gives it, so the payment carries PayPal Purchase Protection.
* VERIFY_FIRST → hold. Intent AUTHORIZE: PayPal reserves the buyer's funds but sends nothing. The supplier's proof is
                 reviewed by Nemotron Super against the report's open questions (with deterministic payment rules on top),
                 and only then is the hold captured (released) or voided (cancelled).
* STOP         → no payment can be started.

Every PayPal call carries an idempotency key derived from our deposit id, every amount is checked against what PayPal
reports back, and webhook deliveries are verified with PayPal and applied once.
"""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from ..agent.policies import MONEY_RULES
from ..agent.state import Run
from ..core.config import Settings
from ..core.security import SpendGuard
from ..db.base import Database, DatabaseError
from ..llm import prompts
from ..llm.nebius_client import LLMError, LLMRouter
from ..models.user import User
from ..repositories.deposit_repo import DepositRepo, now
from ..repositories.investigation_repo import InvestigationRepo
from ..risk.rules import RULES, _sentence_around
from .paypal_gateway import PayPalGateway, PaymentError

logger = logging.getLogger("proofbeforepay.deposits")

EMAIL = re.compile(r"^[^@\s<>()\[\],;:\"]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$", re.I)
#: Rules that, if they fire on the supplier's reply, rule out releasing the money whatever the model says.
RELEASE_BLOCKERS = (*MONEY_RULES, "prompt_injection", "inspection_refusal", "off_platform")
RECOMMENDATIONS = ("RELEASE", "KEEP_HOLDING", "VOID")
QUESTION_STATUS = ("ANSWERED", "PARTIAL", "UNANSWERED")
MAX_REVIEWS = 6


class DepositError(Exception):
    def __init__(self, status: int, message: str, code: str = "deposit") -> None:
        super().__init__(message)
        self.status, self.message, self.code = status, message, code


def _text(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _money(value: Any) -> Decimal | None:
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return None
    return amount if amount.is_finite() else None


def _same_amount(a: Any, b: Any) -> bool:
    x, y = _money(a), _money(b)
    return x is not None and x == y


class DepositService:
    def __init__(
        self,
        settings: Settings,
        repo: DepositRepo,
        gateway: PayPalGateway,
        llm: LLMRouter,
        budget: SpendGuard,
        runs: InvestigationRepo,
        find_run: Callable[[str], Awaitable[Run | None]],
        db: Database,
        on_credit_capture: Callable[[str, dict[str, str]], Awaitable[bool]] | None = None,
    ) -> None:
        self.settings, self.repo, self.gateway, self.llm, self.budget, self.runs = settings, repo, gateway, llm, budget, runs
        self.find_run = find_run
        self.events = db.table("paypal_events")
        self.on_credit_capture = on_credit_capture
        self._locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    @property
    def enabled(self) -> bool:
        return self.settings.payments_enabled

    # ── what the report allows ───────────────────────────────────────────────
    def plan(self, report: dict[str, Any]) -> dict[str, Any]:
        """What the payment panel shows for a finished report: pay, hold or blocked, and why."""
        j = report["judgement"]
        decision = j["decision"]
        entities = report.get("entities") or {}
        red_flags = [
            {"id": s["id"], "title": s["title"], "detail": s.get("detail", ""), "why": s.get("why", "")}
            for s in report.get("signals", [])
            if s.get("rule") in MONEY_RULES and s.get("polarity") == "red"
        ]
        if decision == "PROCEED":
            mode, title = "pay", "Pay the deposit with PayPal"
            reason = "The investigation cleared this supplier. Pay through PayPal so the deposit keeps Purchase Protection."
        elif decision == "VERIFY_FIRST":
            mode, title = "hold", "Hold the deposit with PayPal"
            reason = ("The supplier hasn't proved who it is yet. PayPal can reserve the deposit without sending it; "
                      "it's released only once the supplier's proof answers the open questions.")
        else:
            mode, title = "blocked", "Payment blocked"
            reason = "The investigation found reasons to stop. ProofBeforePay won't start a payment to this supplier."
        protections = [
            "Pay a business with PayPal Goods & Services, never Friends & Family or as a 'gift'.",
            "Pay only the deposit (around 30%), with the balance against inspection or shipping documents.",
            "The payee must be the company on the invoice, never a person or another company.",
        ]
        if mode == "hold":
            protections.insert(0, "A PayPal hold reserves the money for up to 29 days. Nothing reaches the supplier until you release it.")
        sandbox = self.settings.paypal_env != "live"
        return {
            "enabled": self.enabled,
            "mode": mode,
            "decision": decision,
            "title": title,
            "reason": reason,
            "headline": j.get("headline", ""),
            "supplier_name": entities.get("supplier_name") or "",
            "deposit_terms": entities.get("deposit") or "",
            "verification_questions": j.get("verification_questions") or [],
            "red_flags": red_flags,
            "protections": protections,
            "currency": self.settings.paypal_currency,
            "max_amount": f"{self.settings.max_deposit:.2f}",
            "environment": self.settings.paypal_env,
            "suggested_payee": self.settings.demo_supplier_paypal_email if sandbox else "",
            "sandbox_buyer": (
                {"email": self.settings.sandbox_buyer_email, "password": self.settings.sandbox_buyer_password}
                if sandbox and self.settings.sandbox_buyer_email
                else None
            ),
        }

    async def _report_for(self, user: User, run_id: str) -> tuple[Run, dict[str, Any]]:
        run = await self.find_run(run_id)
        # A report someone else ran looks exactly like one that doesn't exist.
        if run is None or (run.user_id and run.user_id != user.id):
            raise DepositError(404, "Investigation not found.")
        if not run.report:
            raise DepositError(409, "This investigation hasn't finished yet.")
        return run, run.report

    async def plan_for(self, user: User, run_id: str) -> dict[str, Any]:
        _run, report = await self._report_for(user, run_id)
        out = self.plan(report)
        out["deposits"] = [self.public(d) for d in await self.repo.for_run(user.id, run_id)]
        return out

    # ── starting and finishing a payment ────────────────────────────────────
    async def start(self, user: User, run_id: str, amount: str, payee_email: str | None, note: str = "") -> dict[str, Any]:
        if not self.enabled:
            raise DepositError(503, "PayPal isn't configured on this server.")
        run, report = await self._report_for(user, run_id)
        plan = self.plan(report)
        if plan["mode"] == "blocked":
            raise DepositError(409, "This supplier got a Stop verdict, so ProofBeforePay won't start a payment to it.", "blocked")
        value = _money(amount)
        if value is None or value <= 0:
            raise DepositError(400, "Enter the deposit amount, for example 1500.00.")
        if value > Decimal(str(self.settings.max_deposit)):
            raise DepositError(400, f"Deposits are capped at {self.settings.max_deposit:,.2f} {self.settings.paypal_currency} here.")
        payee = (payee_email or "").strip().lower() or None
        if payee and not EMAIL.match(payee):
            raise DepositError(400, "That doesn't look like a PayPal email address.")

        deposit_id = str(uuid.uuid4())
        hold = plan["mode"] == "hold"
        supplier = _text(plan["supplier_name"], 120) or "the supplier"
        base = f"{self.settings.public_url}/investigations?id={run.id}&deposit={deposit_id}"
        try:
            created = await self.gateway.create_deposit_order(
                hold=hold,
                amount=f"{value:.2f}",
                currency=self.settings.paypal_currency,
                reference=deposit_id,
                description=f"{'Deposit hold' if hold else 'Deposit'} for {supplier} (ProofBeforePay check {run.id[:8]})",
                invoice_id=f"PBP-{deposit_id[:18]}",
                payee_email=payee,
                return_url=f"{base}&paypal=return",
                cancel_url=f"{base}&paypal=cancel",
            )
        except PaymentError as exc:
            raise DepositError(502, str(exc), "paypal") from exc
        await self.repo.create({
            "id": deposit_id, "user_id": user.id, "run_id": run.id, "supplier_name": supplier,
            "decision": plan["decision"], "mode": plan["mode"], "amount": f"{value:.2f}", "currency": self.settings.paypal_currency,
            "payee_email": payee, "paypal_order_id": created["id"], "authorization_id": None, "capture_id": None,
            "status": "created", "payer_email": None, "expires_at": None, "tracking": None, "reviews": [],
            "note": _text(note, 300) or None,
            "timeline": [self._event("created", f"{'Hold' if hold else 'Payment'} of {value:.2f} {self.settings.paypal_currency} started on PayPal")],
        })
        return {"deposit_id": deposit_id, "order_id": created["id"], "approve_url": created["approve_url"], "mode": plan["mode"]}

    async def complete(self, user: User, deposit_id: str) -> dict[str, Any]:
        """The buyer is back from PayPal: capture (pay) or authorize (hold) the approved order, and check the result."""
        deposit = await self._own(user, deposit_id)
        async with self._locks[deposit_id]:
            deposit = await self._own(user, deposit_id)
            if deposit["status"] not in ("created", "pending"):
                return self.public(deposit)
            try:
                if deposit["mode"] == "pay":
                    facts = await self.gateway.capture_order(deposit["paypal_order_id"], request_id=f"{deposit_id}:capture")
                    status, problem = self._check_capture(deposit, facts)
                    values: dict[str, Any] = {"capture_id": facts["capture_id"] or None, "payer_email": facts.get("payer_email") or None}
                    text = {
                        "paid": f"Paid {deposit['amount']} {deposit['currency']} to {deposit['supplier_name']} through PayPal",
                        "pending": "PayPal is still processing the payment",
                    }.get(status, f"PayPal didn't confirm the payment ({problem})")
                else:
                    facts = await self.gateway.authorize_order(deposit["paypal_order_id"], request_id=f"{deposit_id}:authorize")
                    status, problem = self._check_authorization(deposit, facts)
                    values = {
                        "authorization_id": facts["authorization_id"] or None,
                        "expires_at": facts["expires_at"] or None,
                        "payer_email": facts.get("payer_email") or None,
                    }
                    text = (
                        f"PayPal is holding {deposit['amount']} {deposit['currency']}. Nothing has been sent to the supplier"
                        if status == "held"
                        else f"PayPal didn't confirm the hold ({problem})"
                    )
            except PaymentError as exc:
                raise DepositError(402, "PayPal hasn't confirmed this payment. If you approved it, try again in a moment.", "paypal") from exc
            if problem:
                logger.error("Rejected PayPal result for deposit %s: %s", deposit_id, problem)
            await self._update(deposit, status=status, event=(status, text), **values)
            return self.public(await self._own(user, deposit_id))

    @staticmethod
    def _check_capture(deposit: dict[str, Any], facts: dict[str, str]) -> tuple[str, str]:
        if facts["capture_status"] == "PENDING":
            return "pending", ""
        if facts["order_status"] != "COMPLETED" or facts["capture_status"] != "COMPLETED":
            return "failed", f"status {facts['order_status']}/{facts['capture_status']}"
        if facts["custom_id"] != deposit["id"]:
            return "failed", "reference mismatch"
        if facts["currency"] != deposit["currency"] or not _same_amount(facts["amount"], deposit["amount"]):
            return "failed", f"amount {facts['amount']} {facts['currency']}"
        return "paid", ""

    @staticmethod
    def _check_authorization(deposit: dict[str, Any], facts: dict[str, str]) -> tuple[str, str]:
        if facts["authorization_status"] not in ("CREATED", "PENDING") or not facts["authorization_id"]:
            return "failed", f"authorization {facts['authorization_status'] or 'missing'}"
        if facts["custom_id"] != deposit["id"]:
            return "failed", "reference mismatch"
        if facts["currency"] != deposit["currency"] or not _same_amount(facts["amount"], deposit["amount"]):
            return "failed", f"amount {facts['amount']} {facts['currency']}"
        return "held", ""

    # ── reviewing the supplier's proof (AI + rules) ─────────────────────────
    async def review(self, user: User, deposit_id: str, proof: str) -> dict[str, Any]:
        deposit = await self._own(user, deposit_id)
        if deposit["status"] != "held":
            raise DepositError(409, "Only a deposit on hold can be reviewed for release.")
        proof = proof.strip()
        _run, report = await self._report_for(user, deposit["run_id"])
        if not self.settings.llm_configured:
            raise DepositError(503, "The models aren't configured on this server.")
        if not self.budget.claim():
            raise DepositError(503, "The live demo has used up its model budget for now.")
        scratch, cost = Run("release-review", {}), 0.0
        try:
            data = await self.llm.complete_json(
                scratch, tier="super", step="release_review", messages=prompts.proof_review_messages(report, proof[:6000]),
                max_tokens=1200, temperature=0.1,
            )
        except (LLMError, ValueError) as exc:
            logger.warning("Release review failed for %s: %s", deposit_id, exc)
            raise DepositError(502, "Couldn't review the proof just now. Please try again.") from exc
        finally:
            cost = sum(e["call"]["cost_usd"] for e in scratch.events if e["type"] == "llm_call")
            self.budget.settle(cost)
            await self.runs.record_spend(f"release-review:{deposit_id}", cost)

        review = self._clean_review(data if isinstance(data, dict) else {})
        guard = self._rule_hits(proof)
        if guard:
            # Code has the last word: a reply that changes who gets paid, asks for an unprotected method or tries to
            # steer the reviewer can never clear a release, whatever the model concluded.
            review["recommendation"] = "VOID" if any(h["severity"] == "high" for h in guard) else "KEEP_HOLDING"
            review["concerns"] = [f"{h['title']}: “{h['quote']}”" for h in guard] + review["concerns"]
            review["overridden_by_rules"] = True
        review.update({"id": str(uuid.uuid4())[:8], "at": now(), "model": self.llm.tiers["super"].model, "cost_usd": round(cost, 6),
                       "proof_excerpt": _text(proof, 280)})
        reviews = ([*(deposit.get("reviews") or []), review])[-MAX_REVIEWS:]
        label = {"RELEASE": "cleared the release", "KEEP_HOLDING": "says keep holding", "VOID": "recommends cancelling"}[review["recommendation"]]
        await self._update(deposit, reviews=reviews, event=("review", f"Nemotron Super reviewed the supplier's proof and {label}"))
        return review

    @staticmethod
    def _question_status(q: dict[str, Any]) -> str:
        """The model reports facts about each answer; code decides what they add up to."""
        if "evidence" not in q:  # older shape: the model graded it directly
            status = _text(q.get("status"), 20).upper()
            return status if status in QUESTION_STATUS else "UNANSWERED"
        if not _text(q.get("evidence"), 600):
            return "UNANSWERED"
        if q.get("covers_all_parts") is True and q.get("consistent") is not False:
            return "ANSWERED"
        return "PARTIAL"

    @staticmethod
    def _clean_review(data: dict[str, Any]) -> dict[str, Any]:
        model_rec = _text(data.get("recommendation"), 20).upper().replace(" ", "_")
        questions, contradictions = [], []
        for q in data.get("questions") if isinstance(data.get("questions"), list) else []:
            if isinstance(q, dict) and _text(q.get("question"), 300):
                status = DepositService._question_status(q)
                evidence, note = _text(q.get("evidence"), 300).rstrip(" .;"), _text(q.get("note"), 300)
                if q.get("consistent") is False:
                    contradictions.append(f"Contradicts the investigation: {evidence or _text(q.get('question'), 120)}")
                questions.append({
                    "question": _text(q.get("question"), 300),
                    "status": status,
                    "note": " ".join(x for x in (evidence and f"Reply: {evidence}.", note) if x),
                })
        lists = {k: [t for t in (_text(x, 300) for x in (data.get(k) or []) if isinstance(data.get(k), list)) if t][:6] for k in ("concerns", "still_needed")}
        lists["concerns"] = (contradictions + lists["concerns"])[:6]
        # Code derives the recommendation: the model can always ask to VOID, but RELEASE needs every question answered
        # with consistent evidence and no new concern, whatever the model's own read was.
        if model_rec == "VOID":
            rec = "VOID"
        elif questions and all(q["status"] == "ANSWERED" for q in questions) and not lists["concerns"]:
            rec = "RELEASE"
        else:
            rec = "KEEP_HOLDING"
        return {
            "recommendation": rec,
            "summary": _text(data.get("summary"), 500) or "The reviewer couldn't summarise the reply.",
            "questions": questions[:8],
            "concerns": lists["concerns"],
            "still_needed": lists["still_needed"],
            "overridden_by_rules": False,
        }

    @staticmethod
    def _rule_hits(text: str) -> list[dict[str, str]]:
        hits = []
        for rule in RULES:
            if rule.id not in RELEASE_BLOCKERS:
                continue
            match = rule.pattern.search(text)
            if match:
                hits.append({"rule": rule.id, "title": rule.title, "severity": rule.severity, "quote": _sentence_around(text, match.start(), match.end())})
        return hits

    # ── releasing or cancelling a hold ──────────────────────────────────────
    async def release(self, user: User, deposit_id: str, acknowledge_risk: bool = False) -> dict[str, Any]:
        async with self._locks[deposit_id]:
            deposit = await self._own(user, deposit_id)
            if deposit["status"] != "held":
                raise DepositError(409, "Only a deposit on hold can be released.")
            latest = (deposit.get("reviews") or [None])[-1]
            cleared = bool(latest and latest["recommendation"] == "RELEASE")
            if not cleared and not acknowledge_risk:
                raise DepositError(
                    409,
                    "The supplier's proof hasn't cleared review yet. Review their reply first, or confirm you accept the risk.",
                    "needs_review",
                )
            try:
                facts = await self.gateway.capture_authorization(deposit["authorization_id"], request_id=f"{deposit_id}:release")
            except PaymentError as exc:
                raise DepositError(502, str(exc), "paypal") from exc
            if facts["capture_status"] not in ("COMPLETED", "PENDING") or not _same_amount(facts["amount"], deposit["amount"]):
                await self._update(deposit, status="failed", event=("failed", f"PayPal didn't release the hold ({facts['capture_status']})"))
                raise DepositError(402, "PayPal didn't release the hold. Nothing was sent.", "payment_failed")
            how = "after the AI review cleared it" if cleared else "by the buyer, overriding the AI review"
            await self._update(
                deposit, status="released" if facts["capture_status"] == "COMPLETED" else "pending", capture_id=facts["capture_id"],
                event=("released", f"Released {deposit['amount']} {deposit['currency']} to {deposit['supplier_name']} {how}"),
            )
            return self.public(await self._own(user, deposit_id))

    async def cancel(self, user: User, deposit_id: str) -> dict[str, Any]:
        async with self._locks[deposit_id]:
            deposit = await self._own(user, deposit_id)
            if deposit["status"] == "created":
                await self._update(deposit, status="cancelled", event=("cancelled", "Payment cancelled before PayPal approval"))
            elif deposit["status"] == "held":
                try:
                    await self.gateway.void_authorization(deposit["authorization_id"], request_id=f"{deposit_id}:void")
                except PaymentError as exc:
                    raise DepositError(502, str(exc), "paypal") from exc
                await self._update(deposit, status="voided", event=("voided", "Hold cancelled. PayPal released the funds back to the buyer"))
            else:
                raise DepositError(409, "This deposit can't be cancelled any more.")
            return self.public(await self._own(user, deposit_id))

    async def add_tracking(self, user: User, deposit_id: str, tracking_number: str, carrier: str) -> dict[str, Any]:
        deposit = await self._own(user, deposit_id)
        if deposit["status"] not in ("paid", "released") or not deposit.get("capture_id"):
            raise DepositError(409, "Tracking can be added once the deposit has been paid.")
        number, carrier = _text(tracking_number, 64), _text(carrier, 64) or "OTHER"
        if not re.fullmatch(r"[A-Za-z0-9-]{4,64}", number):
            raise DepositError(400, "Enter the tracking number exactly as the carrier gave it.")
        try:
            await self.gateway.add_tracking(deposit["paypal_order_id"], capture_id=deposit["capture_id"], tracking_number=number, carrier=carrier)
        except PaymentError as exc:
            raise DepositError(502, str(exc), "paypal") from exc
        await self._update(deposit, tracking={"number": number, "carrier": carrier, "added_at": now()},
                           event=("tracking", f"Tracking {carrier} {number} added to the PayPal transaction"))
        return self.public(await self._own(user, deposit_id))

    async def list(self, user: User) -> list[dict[str, Any]]:
        return [self.public(d) for d in await self.repo.for_user(user.id)]

    # ── webhooks ─────────────────────────────────────────────────────────────
    async def handle_webhook(self, event: dict[str, Any]) -> str:
        """Apply a verified PayPal webhook once. Returns what happened, for the log."""
        event_id, kind = _text(event.get("id"), 80), _text(event.get("event_type"), 80)
        resource = event.get("resource") if isinstance(event.get("resource"), dict) else {}
        if not event_id or not kind:
            return "ignored: malformed"
        if await self.events.select(where={"id": event_id}, limit=1):
            return "duplicate"
        related = ((resource.get("supplementary_data") or {}).get("related_ids") or {}) if isinstance(resource, dict) else {}
        order_id, resource_id = related.get("order_id") or "", _text(resource.get("id"), 80)
        outcome = "ignored"
        if kind.startswith("PAYMENT.CAPTURE."):
            deposit = (await self.repo.by_capture(resource_id)) or (await self.repo.by_paypal_order(order_id) if order_id else None)
            if deposit:
                outcome = await self._apply_capture_event(deposit, kind, resource, related)
            elif order_id and self.on_credit_capture and kind == "PAYMENT.CAPTURE.COMPLETED":
                facts = {"capture_status": "COMPLETED", "capture_id": resource_id, "amount": str((resource.get("amount") or {}).get("value", "")),
                         "currency": str((resource.get("amount") or {}).get("currency_code", "")), "custom_id": str(resource.get("custom_id") or "")}
                outcome = "credits settled" if await self.on_credit_capture(order_id, facts) else "credits: nothing to do"
        elif kind == "PAYMENT.AUTHORIZATION.VOIDED":
            deposit = await self.repo.by_authorization(resource_id)
            if deposit and deposit["status"] == "held":
                await self._update(deposit, status="voided", event=("voided", "PayPal voided the hold"))
                outcome = "deposit voided"
        try:
            await self.events.insert([{"id": event_id, "event_type": kind, "resource_id": resource_id, "received_at": now()}])
        except DatabaseError:
            pass  # a concurrent delivery recorded it first
        return outcome

    async def _apply_capture_event(self, deposit: dict[str, Any], kind: str, resource: dict[str, Any], related: dict[str, Any]) -> str:
        from_hold = bool(related.get("authorization_id"))
        if kind == "PAYMENT.CAPTURE.COMPLETED" and deposit["status"] in ("pending", "created", "held"):
            amount = (resource.get("amount") or {})
            if not _same_amount(amount.get("value"), deposit["amount"]) or amount.get("currency_code") != deposit["currency"]:
                logger.error("Webhook capture amount mismatch for deposit %s", deposit["id"])
                return "amount mismatch"
            status = "released" if from_hold or deposit["mode"] == "hold" else "paid"
            await self._update(deposit, status=status, capture_id=_text(resource.get("id"), 80),
                               event=(status, "PayPal confirmed the payment (webhook)"))
            return f"deposit {status}"
        if kind in ("PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED") and deposit["status"] in ("pending", "created"):
            await self._update(deposit, status="failed", event=("failed", "PayPal declined the payment"))
            return "deposit failed"
        if kind in ("PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED") and deposit["status"] in ("paid", "released"):
            await self._update(deposit, status="refunded", event=("refunded", "PayPal refunded or reversed the payment"))
            return "deposit refunded"
        return "no change"

    # ── helpers ──────────────────────────────────────────────────────────────
    async def _own(self, user: User, deposit_id: str) -> dict[str, Any]:
        deposit = await self.repo.get(deposit_id) if re.fullmatch(r"[0-9a-f-]{36}", deposit_id or "") else None
        if deposit is None or deposit["user_id"] != user.id:
            raise DepositError(404, "We couldn't find that deposit.")
        return deposit

    @staticmethod
    def _event(kind: str, text: str) -> dict[str, str]:
        return {"at": now(), "kind": kind, "text": text}

    async def _update(self, deposit: dict[str, Any], *, event: tuple[str, str] | None = None, **values: Any) -> None:
        if event:
            values["timeline"] = [*(deposit.get("timeline") or []), self._event(*event)][-30:]
        await self.repo.update(deposit["id"], **values)
        deposit.update(values)

    @staticmethod
    def public(d: dict[str, Any]) -> dict[str, Any]:
        keys = ("id", "run_id", "supplier_name", "decision", "mode", "currency", "payee_email", "paypal_order_id", "status",
                "expires_at", "tracking", "reviews", "timeline", "created_at", "updated_at")
        out = {k: d.get(k) for k in keys}
        out["amount"] = f"{_money(d.get('amount')) or Decimal('0'):.2f}"
        out["reviews"] = out["reviews"] or []
        out["timeline"] = out["timeline"] or []
        return out
