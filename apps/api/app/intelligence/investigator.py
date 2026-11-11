"""Step 2: the investigation loop.

Each round runs the open leads in parallel, has a model read the pages they return, and hands what the sources say to
the reconciler. A disagreement between two sources opens new leads aimed at a third, and the loop goes on until nothing
is left to follow or the budget (rounds, leads, depth) runs out. The result is a chain of evidence, not a list of
search results.
"""
from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from ..agent.casefile import DONE, OPEN, UNAVAILABLE
from ..agent.policies import TOOLS
from ..agent.reconcile import Reconciler
from ..agent.workflow import _log, _text, stage
from ..llm import prompts
from ..llm.nebius_client import LLMError
from ..risk.matching import quote_in

if TYPE_CHECKING:
    from ..agent.state import Investigation

FIELDS = {
    "legal_name", "reg_no", "address", "status", "incorporated", "business_scope", "business_type", "trade_role", "shipments",
    "cert_holder", "cert_number", "cert_status", "cert_scope", "owner_name", "reports", "address_use",
}
BATCH = 6  # leads per round
# Findings that leave an open question a different kind of source could settle.
FOLLOWABLE = {"registry_missing", "address_mismatch", "image_candidate", "cert_unverified", "no_trade_history", "domain_new", "scam_reports"}


class Investigator:
    """Runs rounds of lookups until the evidence chain is complete or the budget is spent."""

    async def _investigate(self, inv: Investigation) -> None:
        run, case, limits = inv.run, inv.case, self.limits
        reconciler = Reconciler(inv)
        async with stage(run, "investigate"):
            round_no = 0
            while case.has_open and round_no < limits["rounds"]:
                round_no += 1
                batch = case.next_batch(BATCH)
                _log(run, "investigate", f"Round {round_no}: {len(batch)} lookup(s) in parallel ({', '.join(lead['tool'] for lead in batch)})")
                run.emit("round", round=round_no, leads=[lead["id"] for lead in batch])
                for lead in batch:
                    case.update(lead, "running", round=round_no)
                outputs = await asyncio.gather(*(self._run_lead(inv, lead) for lead in batch))
                before = len(inv.signals.items)
                for lead, assertions in zip(batch, outputs):
                    if not lead.get("unavailable"):  # a lookup that couldn't run is "not checked", never a finding
                        reconciler.reconcile(lead, assertions)
                    self._close(inv, lead)
                inv.rounds.append({"round": round_no, "leads": [lead["id"] for lead in batch], "findings": len(inv.signals.items) - before})
                if round_no < limits["rounds"]:
                    await self._plan_followups(inv, reconciler)

            skipped = [lead for lead in case.leads if lead["status"] == OPEN]
            for lead in skipped:
                case.update(lead, "skipped", summary="Not run: the investigation reached its limit.")
            inv.stop_reason = (
                "All leads were followed up." if not skipped
                else f"Stopped after {round_no} round(s); {len(skipped)} lead(s) were not followed up."
            )
            self._finish_claims(inv)
            counts = {p: sum(1 for s in inv.signals.items if s["polarity"] == p) for p in ("red", "amber", "green")}
            _log(
                run, "investigate",
                f"{len(case.leads)} lookups, {len(inv.sources.items)} sources, {counts['red']} red / {counts['amber']} amber / {counts['green']} green findings. {inv.stop_reason}",
            )

    # ── one lead ─────────────────────────────────────────────────────────────
    async def _run_lead(self, inv: Investigation, lead: dict[str, Any]) -> list[dict[str, Any]]:
        out = await self.tools.run(inv.run, lead)
        pages: list[dict[str, Any]] = []
        for page in out.pages:
            source = inv.sources.add(page["url"], page["title"], page["content"], purpose=lead["tool"])
            page["source"] = source
            pages.append(page)
        lead["source_ids"] = list(dict.fromkeys(p["source"]["id"] for p in pages))
        lead["note"] = out.note
        if not out.available:
            lead["unavailable"] = True
            return []
        assertions = [
            {"field": f["field"], "value": f["value"], "quote": f["quote"], "source_id": page["source"]["id"], "lead": lead["id"]}
            for page in pages
            for f in page["facts"]
        ]
        readable = [p for p in pages if p["observe"]]
        if readable:
            assertions += await self._observe(inv, lead, readable)
        inv.assertions.extend(assertions)
        return assertions

    async def _observe(self, inv: Investigation, lead: dict[str, Any], pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """A model reads the pages and reports what they say. Code keeps only what the cited page really contains."""
        sources = [p["source"] for p in pages[:8]]
        messages = prompts.observe_messages(inv.profile, lead, sources)
        data: Any = None
        for tier in ("nano", "super"):  # Super reads it again only if Nano's answer couldn't be used
            try:
                data = await self.llm.complete_json(inv.run, tier=tier, step=f"investigate:{lead['id']}", messages=messages, max_tokens=1500)
            except (LLMError, ValueError) as exc:
                _log(inv.run, "investigate", f"{lead['id']}: {tier} couldn't read the pages ({exc})", "warn")
                continue
            if isinstance(data, dict) and isinstance(data.get("assertions"), list):
                break
        by_id = {s["id"]: s for s in sources}
        kept: list[dict[str, Any]] = []
        for item in (data or {}).get("assertions", []) if isinstance(data, dict) else []:
            if not isinstance(item, dict):
                continue
            field, value = _text(item.get("field"), 30).lower(), _text(item.get("value"), 300)
            source = by_id.get(_text(item.get("source_id"), 10).upper())
            quote = _text(item.get("quote"), 400)
            if field not in FIELDS or not value or source is None or not quote_in(quote, source["content"]):
                continue  # never keep a statement we cannot find word for word in the page it is attributed to
            kept.append({"field": field, "value": value, "quote": quote, "source_id": source["id"], "lead": lead["id"]})
        return kept

    def _close(self, inv: Investigation, lead: dict[str, Any]) -> None:
        found = len(lead["finding_ids"])
        if lead.pop("unavailable", False):
            inv.case.update(lead, UNAVAILABLE, summary=f"Not checked: {lead.pop('note', '')}")
            self._note_unchecked(inv, lead)
            return
        note = lead.pop("note", "")
        pages = len(lead["source_ids"])
        summary = f"{pages} source(s), {found} finding(s)." + (f" {note}" if note and not found else "")
        inv.case.update(lead, DONE, summary=summary)

    @staticmethod
    def _note_unchecked(inv: Investigation, lead: dict[str, Any]) -> None:
        """A lookup that could not run leaves its claim 'inconclusive', never 'contradicted'."""
        claim_type = {"image": "imagery", "certificate": "certification", "registry": "identity", "address": "address"}.get(lead["tool"])
        for claim in inv.claims:
            if claim["type"] == claim_type and claim["status"] == "inconclusive" and claim["note"] == "Not checked yet.":
                claim["note"] = lead["summary"][:300]
                inv.run.emit("claim", claim=claim)

    # ── adaptive follow-up ───────────────────────────────────────────────────
    async def _plan_followups(self, inv: Investigation, reconciler: Reconciler) -> None:
        """When a finding leaves a question the rules didn't follow up, a model may propose up to two more lookups."""
        room = min(2, inv.case.max_leads - len(inv.case.leads))
        loose = [s for s in inv.signals.items if s["polarity"] in ("red", "amber") and not s["spawned"] and (s["rule"] in FOLLOWABLE or s["polarity"] == "red")]
        if room <= 0 or not loose or inv.case.has_open and len(inv.case.next_batch(BATCH)) >= 3:
            return
        try:
            data = await self.llm.complete_json(
                inv.run, tier="super", step="investigate:plan",
                messages=prompts.plan_messages(inv.profile, inv.signals.items, inv.claims, inv.case.leads, room), max_tokens=700,
            )
        except (LLMError, ValueError) as exc:
            _log(inv.run, "investigate", f"The lead planner failed ({exc}); continuing with the leads already open", "warn")
            return
        opened = 0
        for item in (data or {}).get("leads", []) if isinstance(data, dict) else []:
            if opened >= room or not isinstance(item, dict) or item.get("tool") not in TOOLS or not isinstance(item.get("target"), dict):
                continue
            after = inv.signals.get(_text(item.get("after"), 6).upper())
            target = {str(k)[:30]: _text(v, 200) for k, v in item["target"].items() if _text(v, 200)}
            lead = inv.case.add(
                item["tool"], target, _text(item.get("why"), 250) or "Follow up an open question",
                parent_lead=after["lead"] if after else None, parent_finding=after["id"] if after else None, priority=2,
            )
            if lead:
                opened += 1
                if after:
                    after["spawned"].append(lead["id"])
                _log(inv.run, "investigate", f"Lead planner opened {lead['id']} ({lead['tool']}): {lead['why']}")

    # ── closing out ──────────────────────────────────────────────────────────
    @staticmethod
    def _finish_claims(inv: Investigation) -> None:
        for claim in inv.claims:
            if claim["status"] == "inconclusive" and claim["note"] == "Not checked yet.":
                claim["note"] = "No independent source confirmed or contradicted this."
            inv.run.emit("claim", claim=claim)
