"""Hard trust signals: facts established by code, not by a language model.

Payment-term patterns in the paperwork, and the findings the investigation loop reaches when it compares what the
supplier claims with what an independent source says. Every signal carries the exact evidence it was derived from,
the lead that produced it and the leads it opened in turn.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .rules import RULES, _sentence_around

if TYPE_CHECKING:
    from ..agent.state import Run


class SignalBoard:
    """Collects signals for a run, numbering them F1, F2, … and streaming each one to the UI."""

    def __init__(self, run: Run) -> None:
        self.run = run
        self.items: list[dict[str, Any]] = []

    def add(
        self,
        kind: str,
        polarity: str,
        severity: str,
        title: str,
        detail: str,
        *,
        evidence: str = "",
        why: str = "",
        rule: str = "",
        lead: str | None = None,
        sources: list[str] | None = None,
    ) -> dict[str, Any]:
        signal = {
            "id": f"F{len(self.items) + 1}",
            "kind": kind,
            "rule": rule,
            "polarity": polarity,
            "severity": severity,
            "title": title,
            "detail": detail,
            "evidence": evidence,
            "why": why,
            "lead": lead,  # the lookup that produced this finding
            "sources": sources or [],
            "spawned": [],  # leads this finding opened
        }
        self.items.append(signal)
        self.run.emit("signal", signal=signal)
        return signal

    def get(self, signal_id: str | None) -> dict[str, Any] | None:
        return next((s for s in self.items if s["id"] == signal_id), None)

    def has(self, rule: str, lead: str | None = None) -> bool:
        return any(s["rule"] == rule and (lead is None or s["lead"] == lead) for s in self.items)

    def scan_patterns(self, text: str) -> None:
        for rule in RULES:
            match = rule.pattern.search(text)
            if match:
                quote = _sentence_around(text, match.start(), match.end())
                polarity = "red" if rule.severity != "low" else "amber"
                self.add(
                    "pattern", polarity, rule.severity, rule.title, f'The paperwork says: "{quote}"', evidence=quote, why=rule.why, rule=rule.id
                )
