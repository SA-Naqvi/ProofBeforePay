"""Credits and PayPal checkout.

A check costs credits. Credits are bought in packs through PayPal (Orders v2, sandbox by default). The pack's price and
size come from server configuration, never from the browser, and credits are granted only after the server itself
captures the payment and confirms the captured amount, currency and our own order reference match.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from typing import Any

from ..core.config import CreditPack, Settings
from ..models.user import User
from ..repositories.billing_repo import BillingRepo, now
from .paypal_gateway import PayPalGateway, PaymentError

logger = logging.getLogger("proofbeforepay.billing")


class BillingError(Exception):
    def __init__(self, status: int, message: str, code: str = "billing") -> None:
        super().__init__(message)
        self.status, self.message, self.code = status, message, code


class InsufficientCredits(BillingError):
    def __init__(self, balance: int, cost: int) -> None:
        super().__init__(402, f"A check costs {cost} credit{'s' if cost != 1 else ''} and you have {balance}. Buy credits to continue.", "insufficient_credits")
        self.balance, self.cost = balance, cost


class BillingService:
    def __init__(self, settings: Settings, repo: BillingRepo, gateway: PayPalGateway) -> None:
        self.settings, self.repo, self.gateway = settings, repo, gateway
        self._locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    @property
    def enabled(self) -> bool:
        return self.settings.payments_enabled

    @property
    def cost(self) -> int:
        return self.settings.credits_per_check

    @staticmethod
    def exempt(user: User) -> bool:
        """Administrators and the shared demo accounts run checks without spending credits."""
        return user.is_admin or user.demo

    def pack(self, pack_id: str) -> CreditPack | None:
        return next((p for p in self.settings.credit_packs if p.id == pack_id), None)

    # ── reading ──────────────────────────────────────────────────────────────
    async def state(self, user: User | None) -> dict[str, Any]:
        s = self.settings
        out: dict[str, Any] = {
            "enabled": self.enabled,
            "environment": s.paypal_env,
            "currency": s.paypal_currency,
            "cost_per_check": self.cost,
            "packs": [p.public(s.paypal_currency) for p in s.credit_packs],
        }
        if user is not None:
            await self._grant_starting(user)
            await self._refresh_pending(user)
            out |= {
                "balance": await self.repo.balance(user.id),
                "exempt": self.exempt(user),
                "history": await self.repo.history(user.id),
            }
        return out

    async def _grant_starting(self, user: User) -> None:
        if self.settings.starting_credits and not self.exempt(user):
            await self.repo.add(user.id, self.settings.starting_credits, "Welcome credits", f"signup:{user.id}")

    # ── buying ───────────────────────────────────────────────────────────────
    async def start_checkout(self, user: User, pack_id: str) -> dict[str, str]:
        if not self.enabled:
            raise BillingError(503, "Payments aren't configured on this server.")
        pack = self.pack(pack_id)
        if pack is None:
            raise BillingError(400, "That credit pack doesn't exist.")
        order_id = str(uuid.uuid4())
        base = f"{self.settings.public_url}/billing"
        try:
            created = await self.gateway.create_order(pack, reference=order_id, return_url=f"{base}?paid=1", cancel_url=f"{base}?cancelled=1")
        except PaymentError as exc:
            raise BillingError(502, str(exc), "paypal") from exc
        await self.repo.create_order({
            "id": order_id, "user_id": user.id, "pack_id": pack.id, "credits": pack.credits, "amount": pack.price,
            "currency": self.settings.paypal_currency, "paypal_order_id": created["id"], "status": "created", "capture_id": None,
        })
        return {"order_id": created["id"], "approve_url": created["approve_url"]}

    async def capture(self, user: User, paypal_order_id: str) -> dict[str, Any]:
        if not self.enabled:
            raise BillingError(503, "Payments aren't configured on this server.")
        order = await self.repo.order_by_paypal_id(paypal_order_id)
        # Someone else's order looks exactly like one that doesn't exist.
        if order is None or order["user_id"] != user.id:
            raise BillingError(404, "We couldn't find that payment.")
        async with self._locks[user.id]:
            if order["status"] == "completed":
                return await self._result(user, order, "completed", already=True)
            try:
                paid = await self.gateway.capture_order(paypal_order_id, request_id=order["id"])
            except PaymentError as exc:
                raise BillingError(502, str(exc), "paypal") from exc
            problem = self._verify(order, paid)
            if paid["capture_status"] == "PENDING":
                await self.repo.update_order(order["id"], status="pending", capture_id=paid["capture_id"] or None)
                return await self._result(user, order, "pending")
            if problem:
                logger.error("Rejected PayPal capture for order %s: %s", order["id"], problem)
                await self.repo.update_order(order["id"], status="failed", capture_id=paid["capture_id"] or None)
                raise BillingError(402, "PayPal didn't confirm that payment, so no credits were added. If you were charged, contact us with your PayPal receipt.", "payment_failed")
            await self.repo.add(user.id, order["credits"], f"{order['credits']} credits ({order['pack_id']} pack)", f"paypal:{order['id']}")
            await self.repo.update_order(order["id"], status="completed", capture_id=paid["capture_id"], completed_at=now())
            return await self._result(user, order, "completed")

    async def settle_from_paypal(self, paypal_order_id: str, facts: dict[str, str]) -> bool:
        """Finish a purchase that was still pending when the buyer came back: called by the PayPal webhook
        (PAYMENT.CAPTURE.COMPLETED) or when the buyer reopens the billing page. Grants credits at most once."""
        order = await self.repo.order_by_paypal_id(paypal_order_id)
        if order is None or order["status"] not in ("pending", "created"):
            return False
        async with self._locks[order["user_id"] or ""]:
            order = await self.repo.order_by_paypal_id(paypal_order_id)
            if order is None or order["status"] not in ("pending", "created"):
                return False
            problem = self._verify(order, {"order_status": "COMPLETED", **facts})
            if problem or facts.get("capture_status") != "COMPLETED":
                logger.warning("Didn't settle PayPal order %s: %s", paypal_order_id, problem or facts.get("capture_status"))
                return False
            await self.repo.add(order["user_id"], order["credits"], f"{order['credits']} credits ({order['pack_id']} pack)", f"paypal:{order['id']}")
            await self.repo.update_order(order["id"], status="completed", capture_id=facts.get("capture_id") or None, completed_at=now())
            return True

    async def _refresh_pending(self, user: User) -> None:
        if not self.enabled:
            return
        for order in await self.repo.pending_orders(user.id):
            try:
                facts = await self.gateway.order_status(order["paypal_order_id"])
            except Exception as exc:  # the billing page must load even if PayPal can't be reached
                logger.info("Couldn't refresh pending PayPal order %s: %s", order["paypal_order_id"], exc)
                continue
            if facts["capture_status"] == "COMPLETED":
                await self.settle_from_paypal(order["paypal_order_id"], facts)

    @staticmethod
    def _verify(order: dict[str, Any], paid: dict[str, str]) -> str | None:
        """What PayPal says it captured must be exactly what we asked for."""
        if paid["capture_status"] == "PENDING":
            return None
        if paid["order_status"] != "COMPLETED" or paid["capture_status"] != "COMPLETED":
            return f"status {paid['order_status']}/{paid['capture_status']}"
        if paid["custom_id"] != order["id"]:
            return "order reference mismatch"
        # Postgres may hand the stored amount back as a number rather than the string we wrote, so compare as decimals.
        try:
            same_amount = Decimal(paid["amount"]) == Decimal(str(order["amount"]))
        except InvalidOperation:
            same_amount = False
        if paid["currency"] != order["currency"] or not same_amount:
            return f"amount {paid['amount']} {paid['currency']} != {order['amount']} {order['currency']}"
        return None

    async def _result(self, user: User, order: dict[str, Any], status: str, already: bool = False) -> dict[str, Any]:
        return {
            "status": status,
            "credits": order["credits"] if status == "completed" and not already else 0,
            "balance": await self.repo.balance(user.id),
            "already_applied": already,
        }

    # ── spending ─────────────────────────────────────────────────────────────
    async def charge(self, user: User, run_id: str) -> int:
        """Take the price of one check. Raises InsufficientCredits. Returns the credits taken (0 when exempt)."""
        if not self.enabled or self.exempt(user):
            return 0
        async with self._locks[user.id]:
            await self._grant_starting(user)
            balance = await self.repo.balance(user.id)
            if balance < self.cost:
                raise InsufficientCredits(balance, self.cost)
            await self.repo.add(user.id, -self.cost, "Supplier check", f"run:{run_id}")
        return self.cost

    async def refund(self, user_id: str, run_id: str, credits: int) -> None:
        """Give the credits back when a check fails before producing a report. Safe to call twice."""
        if credits:
            await self.repo.add(user_id, credits, "Refund: the check failed", f"refund:{run_id}")

