"""Credits: an append-only ledger (a user's balance is the sum of their rows) and the PayPal orders behind purchases."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from ..db.base import Database, DatabaseError


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class BillingRepo:
    def __init__(self, db: Database) -> None:
        self.ledger = db.table("credit_ledger")
        self.orders = db.table("payment_orders")

    # ── ledger ──
    async def balance(self, user_id: str) -> int:
        rows = await self.ledger.select(where={"user_id": user_id}, columns="delta")
        return sum(int(r["delta"]) for r in rows)

    async def has_ref(self, ref: str) -> bool:
        return bool(await self.ledger.select(where={"ref": ref}, columns="ref", limit=1))

    async def add(self, user_id: str, delta: int, reason: str, ref: str) -> bool:
        """Append a ledger row. `ref` is unique, so replaying the same event (a retried capture, a double refund) is a
        no-op: returns False when the row already existed."""
        if await self.has_ref(ref):
            return False
        try:
            await self.ledger.insert([{
                "id": str(uuid.uuid4()), "user_id": user_id, "delta": delta, "reason": reason, "ref": ref, "created_at": now(),
            }])
        except DatabaseError:
            if await self.has_ref(ref):  # the unique index caught a concurrent duplicate
                return False
            raise
        return True

    async def history(self, user_id: str, limit: int = 20) -> list[dict[str, Any]]:
        return await self.ledger.select(where={"user_id": user_id}, columns="delta,reason,ref,created_at", order="created_at", limit=limit)

    # ── orders ──
    async def create_order(self, row: dict[str, Any]) -> None:
        await self.orders.insert([{**row, "created_at": now(), "completed_at": None}])

    async def order_by_paypal_id(self, paypal_order_id: str) -> dict[str, Any] | None:
        rows = await self.orders.select(where={"paypal_order_id": paypal_order_id}, limit=1)
        return rows[0] if rows else None

    async def update_order(self, order_id: str, **values: Any) -> None:
        await self.orders.update({"id": order_id}, values)
