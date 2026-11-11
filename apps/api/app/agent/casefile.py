"""The case file: every lead the investigation opened, why it opened it, and what it found.

A lead is one targeted lookup (a registry, a customs log, an address, a photo). A finding on one lead can open new
leads, so the file records a chain of evidence: claim → source A → inconsistency → lead on source B → finding → …
Leads are deduplicated and bounded in count and depth so the loop always ends.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from .policies import TOOLS

if TYPE_CHECKING:
    from .state import Run

OPEN, RUNNING, DONE, UNAVAILABLE = "open", "running", "done", "unavailable"


def _norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


class CaseFile:
    def __init__(self, run: Run, *, max_leads: int, max_depth: int) -> None:
        self.run = run
        self.max_leads, self.max_depth = max_leads, max_depth
        self.leads: list[dict[str, Any]] = []
        self._keys: set[tuple[str, str]] = set()
        self.refused: int = 0  # leads proposed but not opened because of the budget

    def add(
        self,
        tool: str,
        target: dict[str, str],
        why: str,
        *,
        parent_lead: str | None = None,
        parent_finding: str | None = None,
        priority: int = 5,
    ) -> dict[str, Any] | None:
        """Open a lead. Returns None when it duplicates an existing one or exceeds the budget."""
        if tool not in TOOLS:
            return None
        target = {k: str(v).strip() for k, v in target.items() if v and str(v).strip()}
        if not target:
            return None
        key = (tool, "|".join(f"{k}={_norm(v)}" for k, v in sorted(target.items())))
        if key in self._keys:
            return None
        parent = self.get(parent_lead)
        depth = (parent["depth"] + 1) if parent else 0
        if depth > self.max_depth or len(self.leads) >= self.max_leads:
            self.refused += 1
            return None
        self._keys.add(key)
        lead = {
            "id": f"L{len(self.leads) + 1}",
            "tool": tool,
            "target": target,
            "why": why[:300],
            "depth": depth,
            "parent_lead": parent_lead,
            "parent_finding": parent_finding,
            "priority": priority,
            "status": OPEN,
            "summary": "",
            "finding_ids": [],
            "source_ids": [],
            "round": None,
        }
        self.leads.append(lead)
        self.run.emit("lead", lead=lead)
        return lead

    def get(self, lead_id: str | None) -> dict[str, Any] | None:
        return next((lead for lead in self.leads if lead["id"] == lead_id), None) if lead_id else None

    def next_batch(self, size: int) -> list[dict[str, Any]]:
        open_leads = [lead for lead in self.leads if lead["status"] == OPEN]
        return sorted(open_leads, key=lambda lead: (lead["priority"], lead["depth"], lead["id"]))[:size]

    @property
    def has_open(self) -> bool:
        return any(lead["status"] == OPEN for lead in self.leads)

    def update(self, lead: dict[str, Any], status: str | None = None, **fields: Any) -> None:
        if status:
            lead["status"] = status
        lead.update(fields)
        self.run.emit("lead", lead=lead)

    def chain(self, finding: dict[str, Any]) -> list[dict[str, Any]]:
        """Walk from a finding back to the claim that started it: the hops that led to this piece of evidence."""
        hops: list[dict[str, Any]] = []
        lead = self.get(finding.get("lead"))
        seen: set[str] = set()
        while lead and lead["id"] not in seen:
            seen.add(lead["id"])
            hops.append({"lead": lead["id"], "tool": lead["tool"], "why": lead["why"], "via_finding": lead["parent_finding"]})
            lead = self.get(lead["parent_lead"])
        return list(reversed(hops))

    def public(self) -> list[dict[str, Any]]:
        return [dict(lead) for lead in self.leads]
