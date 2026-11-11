"""Starting, running and finding investigations: limits, the spending ceiling, ownership and persistence."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from ..agent.orchestrator import Pipeline
from ..agent.state import Run
from ..core.config import Settings
from ..core.security import RateLimiter, SpendGuard
from ..models.user import User
from ..repositories.investigation_repo import InvestigationRepo
from ..repositories.run_store import RunStore
from .billing_service import BillingError, BillingService

logger = logging.getLogger("proofbeforepay.investigations")


class ServiceError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status, self.message = status, message


class InvestigationService:
    def __init__(
        self,
        settings: Settings,
        pipeline: Pipeline,
        store: RunStore,
        repo: InvestigationRepo,
        budget: SpendGuard,
        limiter: RateLimiter,
        billing: BillingService | None = None,
    ) -> None:
        self.settings, self.pipeline, self.store, self.repo = settings, pipeline, store, repo
        self.billing = billing
        self.budget, self.limiter = budget, limiter
        self._slots = asyncio.Semaphore(settings.max_concurrent_runs)
        self._tasks: set[asyncio.Task[None]] = set()

    @property
    def live(self) -> bool:
        return self.settings.live_enabled and self.budget.available()

    async def start(self, offer: dict[str, Any], ip: str, user: User | None) -> Run:
        if not self.settings.live_enabled:
            raise ServiceError(503, "Live checks are not configured on this server. Explore the example investigations instead.")
        if not self.budget.available():
            raise ServiceError(503, "The live demo has used up its model budget. The recorded investigations still work.")
        paying = self.billing is not None and self.billing.enabled
        if paying and user is None:
            raise ServiceError(401, "Sign in to run a check. Each check uses credits you buy with PayPal.")
        blocked = self.limiter.check(ip)
        if blocked:
            raise ServiceError(429, blocked)
        run = self.store.create(offer)
        run.user_id = user.id if user else None
        if paying and user is not None and self.billing is not None:
            try:
                run.charged = await self.billing.charge(user, run.id)
            except BillingError as exc:
                self.store.discard(run.id)
                raise ServiceError(exc.status, exc.message) from exc
        self.budget.claim()
        task = asyncio.create_task(self._execute(run))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return run

    async def _execute(self, run: Run) -> None:
        try:
            async with self._slots:
                await self.pipeline.execute(run)
        finally:
            cost = sum(e["call"]["cost_usd"] for e in run.events if e["type"] == "llm_call")
            self.budget.settle(cost)
            logger.info("Run %s cost $%.4f; total spend $%.4f of $%.2f", run.id, cost, self.budget.spent, self.budget.cap)
            self.store.persist(run)
            await self.repo.record_spend(run.id, cost)
            await self.repo.save(run)
            if run.charged and run.status == "error" and run.user_id and self.billing is not None:
                await self.billing.refund(run.user_id, run.id, run.charged)

    async def find(self, run_id: str) -> Run | None:
        run = self.store.get(run_id)
        if run is None and self.store.valid_id(run_id):
            run = await self.repo.load(run_id)
            if run:
                self.store.remember(run)
        return run

    async def restore_spend(self) -> None:
        spent = await self.repo.spent()
        if spent is not None:
            # The database ledger outlives the server's disk, so it wins over the local file.
            self.budget.spent = max(self.budget.spent, spent)
