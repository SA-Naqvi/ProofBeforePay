"""Deposits paid to (or held for) a supplier through PayPal, each tied to the verification report that allowed it."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..db.base import Database

#: Every state a deposit can be in. `held` is an open PayPal authorization; `released` is a captured one.
STATUSES = ("created", "pending", "paid", "held", "released", "voided", "cancelled", "failed", "refunded")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DepositRepo:
    def __init__(self, db: Database) -> None:
        self.table = db.table("deposits")

    async def create(self, row: dict[str, Any]) -> None:
        await self.table.insert([{**row, "created_at": now(), "updated_at": now()}])

    async def get(self, deposit_id: str) -> dict[str, Any] | None:
        rows = await self.table.select(where={"id": deposit_id}, limit=1)
        return rows[0] if rows else None

    async def by_paypal_order(self, paypal_order_id: str) -> dict[str, Any] | None:
        rows = await self.table.select(where={"paypal_order_id": paypal_order_id}, limit=1)
        return rows[0] if rows else None

    async def by_authorization(self, authorization_id: str) -> dict[str, Any] | None:
        rows = await self.table.select(where={"authorization_id": authorization_id}, limit=1)
        return rows[0] if rows else None

    async def by_capture(self, capture_id: str) -> dict[str, Any] | None:
        rows = await self.table.select(where={"capture_id": capture_id}, limit=1)
        return rows[0] if rows else None

    async def for_user(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        return await self.table.select(where={"user_id": user_id}, order="created_at", limit=limit)

    async def for_run(self, user_id: str, run_id: str) -> list[dict[str, Any]]:
        return await self.table.select(where={"user_id": user_id, "run_id": run_id}, order="created_at")

    async def update(self, deposit_id: str, **values: Any) -> None:
        await self.table.update({"id": deposit_id}, {**values, "updated_at": now()})
