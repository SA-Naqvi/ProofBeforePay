"""Finished investigations in the database: one row with the report and event log (for links and replays), the
evidence trail as plain rows (claims, sources, evidence, signals, findings), and the spend ledger.

Failures are logged and never fail a run; the JSON copy in data/runs is always written too.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from ..agent.state import Run
from ..db.base import Database, DatabaseError

logger = logging.getLogger("proofbeforepay.repo")

_RELATION = {"verified": "supports", "contradicted": "contradicts"}
SUMMARY_COLUMNS = (
    "id,created_at,status,decision,confidence,headline,company,role,challenge_outcome,cost_usd,duration_s,savings_pct,error,user_id"
)


def iso(epoch: float | None) -> str | None:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat() if epoch else None


def epoch(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def evidence_rows(run_id: str, report: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Flatten a report into rows for the evidence-trail tables."""
    claims, evidence = [], []
    for c in report.get("claims") or []:
        claims.append({
            "investigation_id": run_id,
            "claim_id": c["id"],
            "type": c.get("type"),
            "text": c["text"],
            "status": c["status"],
            "confidence": c.get("confidence"),
            "checked_by": c.get("checked_by"),
            "escalated": bool(c.get("escalated")),
            "note": c.get("note"),
        })
        if c.get("source_id"):
            evidence.append({
                "investigation_id": run_id,
                "claim_id": c["id"],
                "source_id": c["source_id"],
                "excerpt": c.get("quote") or None,
                "relation": _RELATION.get(c["status"], "context"),
            })
    sources = [
        {
            "investigation_id": run_id,
            "source_id": s["id"],
            "url": s["url"],
            "title": s.get("title"),
            "domain": s.get("domain"),
            "purposes": s.get("purposes") or [],
            "retrieved_at": iso(s.get("retrieved_at")),
        }
        for s in report.get("sources") or []
    ]
    signals = [
        {
            "investigation_id": run_id,
            "signal_id": f["id"],
            "rule": f.get("rule") or None,
            "kind": f.get("kind"),
            "polarity": f["polarity"],
            "severity": f.get("severity"),
            "title": f["title"],
            "detail": f.get("detail"),
        }
        for f in report.get("signals") or []
    ]
    findings = [
        {"investigation_id": run_id, "position": i, "polarity": f["polarity"], "text": f["text"], "refs": f.get("refs") or []}
        for i, f in enumerate((report.get("judgement") or {}).get("key_findings") or [])
    ]
    return {"claims": claims, "sources": sources, "evidence": evidence, "signals": signals, "findings": findings}


def summary_row(row: dict[str, Any]) -> dict[str, Any]:
    """A database row in the shape the frontend uses for run summaries (created_at as epoch seconds)."""
    return {**row, "created_at": epoch(row["created_at"]) if isinstance(row.get("created_at"), str) else row.get("created_at")}


class InvestigationRepo:
    def __init__(self, db: Database) -> None:
        self.db = db

    async def save(self, run: Run) -> None:
        report = run.report or {}
        judgement = report.get("judgement") or {}
        entities = report.get("entities") or {}
        telemetry = report.get("telemetry") or {}
        row = {
            "id": run.id,
            "created_at": iso(run.created_at),
            "status": run.status,
            "user_id": run.user_id,
            "input": run.input,
            "decision": judgement.get("decision"),
            "confidence": judgement.get("confidence"),
            "headline": judgement.get("headline"),
            "company": entities.get("supplier_name") or None,
            "role": entities.get("products") or None,
            "challenge_outcome": (report.get("challenge") or {}).get("outcome"),
            "report": run.report,
            "events": run.events,
            "error": run.error,
            "cost_usd": round(telemetry.get("cost_usd", 0.0), 6),
            "duration_s": telemetry.get("duration_s"),
            "savings_pct": telemetry.get("savings_pct"),
            "methodology_version": report.get("version", 1),
        }
        try:
            await self.db.table("investigations").insert([row], upsert_on=("id",))
            if report:
                rows = evidence_rows(run.id, report)
                keys = {
                    "claims": ("investigation_id", "claim_id"),
                    "sources": ("investigation_id", "source_id"),
                    "signals": ("investigation_id", "signal_id"),
                    "findings": ("investigation_id", "position"),
                }
                # Parents before children: evidence references both claims and sources.
                await asyncio.gather(*(self.db.table(t).insert(rows[t], upsert_on=k) for t, k in keys.items()))
                await self.db.table("evidence").insert(rows["evidence"], upsert_on=("investigation_id", "claim_id"))
        except DatabaseError as exc:
            logger.error("Could not save run %s: %s", run.id, exc)

    async def load(self, run_id: str) -> Run | None:
        try:
            rows = await self.db.table("investigations").select(
                where={"id": run_id}, columns="id,input,status,created_at,report,error,events,user_id", limit=1
            )
        except DatabaseError as exc:
            logger.error("Could not load run %s: %s", run_id, exc)
            return None
        if not rows:
            return None
        record = rows[0]
        record["created_at"] = epoch(record["created_at"]) if isinstance(record["created_at"], str) else record["created_at"]
        return Run.from_record(record)

    async def for_user(self, user_id: str, limit: int = 100) -> list[dict[str, Any]]:
        rows = await self.db.table("investigations").select(where={"user_id": user_id}, columns=SUMMARY_COLUMNS, order="created_at", limit=limit)
        return [summary_row(r) for r in rows]

    async def recent(self, limit: int = 300) -> list[dict[str, Any]]:
        rows = await self.db.table("investigations").select(columns=SUMMARY_COLUMNS, order="created_at", limit=limit)
        return [summary_row(r) for r in rows]

    async def delete_for_user(self, user_id: str) -> None:
        await self.db.table("investigations").delete({"user_id": user_id})

    async def record_spend(self, run_id: str, cost_usd: float) -> None:
        try:
            await self.db.table("spend_ledger").insert([{"investigation_id": run_id, "cost_usd": round(cost_usd, 6)}])
        except DatabaseError as exc:
            logger.error("Could not record spend for %s: %s", run_id, exc)

    async def spent(self) -> float | None:
        try:
            rows = await self.db.table("spend_ledger").select(columns="cost_usd", limit=10000)
        except DatabaseError as exc:
            logger.error("Could not read the spend ledger: %s", exc)
            return None
        return sum(float(r["cost_usd"]) for r in rows)
