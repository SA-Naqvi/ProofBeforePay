"""Step 6: Nemotron Super argues against the verdict and audits its findings."""
from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from ..agent import policies
from ..agent.policies import _INLINE_REF, BLOCKS_PROCEED, DECISION_LABEL, DECISIONS
from ..agent.workflow import _log, _text, stage
from ..llm import prompts
from ..llm.nebius_client import LLMError

if TYPE_CHECKING:
    from ..agent.state import Investigation


class ChallengePass:
    """Counter-searches, the best case against the verdict, and what would change it."""

    async def _challenge(self, inv: Investigation) -> None:
        """A second model argues against the verdict with its own searches. Code decides what that changes."""
        run, judgement = inv.run, inv.judgement
        async with stage(run, "challenge"):
            label = DECISION_LABEL[judgement["decision"]]
            _log(run, "challenge", f'Nemotron Super is building the strongest case against "{label}"')
            try:
                plan = await self.llm.complete_json(
                    run,
                    tier="super",
                    step="challenge:plan",
                    messages=prompts.challenge_plan_messages(inv.offer, judgement, inv.signals.items, inv.claims, inv.searched),
                    max_tokens=700,
                )
            except (LLMError, ValueError) as exc:
                _log(run, "challenge", f"Couldn't plan the challenge ({exc}); the verdict stands unchallenged", "warn")
                return
            plan = plan if isinstance(plan, dict) else {}
            hypothesis = _text(plan.get("counter_hypothesis"), 300)
            queries = [q for q in (_text(x, 200) for x in plan.get("searches") or []) if q][:2]
            fresh: list[dict[str, Any]] = []
            if queries:
                _log(run, "challenge", "Looking for counter-evidence: " + " · ".join(queries))
                batches = await asyncio.gather(
                    *(self.web.search(run, q, step="challenge", purpose="challenge", depth="basic", max_results=4) for q in queries)
                )
                for results in batches:
                    fresh.extend(inv.sources.add_results(results, purpose="challenge"))
                fresh = list({s["id"]: s for s in fresh}.values())[:8]
            try:
                data = await self.llm.complete_json(
                    run,
                    tier="super",
                    step="challenge",
                    messages=prompts.challenge_messages(
                        inv.offer, judgement, hypothesis, inv.signals.items, inv.claims, inv.case.leads, fresh, self._cited_sources(inv)
                    ),
                    max_tokens=1500,
                )
            except (LLMError, ValueError) as exc:
                _log(run, "challenge", f"The challenge failed ({exc}); the verdict stands unchallenged", "warn")
                return
            if not isinstance(data, dict):
                return
            inv.challenge = self._clean_challenge(data, inv, hypothesis, queries, fresh)
            effect = self._apply_challenge(inv)
            run.emit("challenge", challenge=inv.challenge)
            if effect or inv.challenge["disputed"]:
                run.emit("judgement", judgement=inv.judgement)

    @staticmethod
    def _cited_sources(inv: Investigation) -> list[dict[str, Any]]:
        """The sources Ultra's key findings rest on, so the challenger can check each finding against them."""
        ids = list(dict.fromkeys(r for f in inv.judgement["key_findings"] for r in f["refs"] if r.startswith("S")))
        return [s for s in (inv.sources.get(i) for i in ids[:10]) if s]

    def _clean_challenge(
        self, data: dict[str, Any], inv: Investigation, hypothesis: str, queries: list[str], fresh: list[dict[str, Any]]
    ) -> dict[str, Any]:
        known = (
            {s["id"] for s in inv.signals.items} | {c["id"] for c in inv.claims} | {s["id"] for s in inv.sources.items}
            | {lead["id"] for lead in inv.case.leads}
        )

        def cited(value: Any, limit: int) -> str:
            # Drop citations to ids that don't exist rather than show dead links.
            return _INLINE_REF.sub(lambda m: m.group(0) if m.group(1) in known else "", _text(value, limit)).strip()

        # The challenger names the decision it thinks is right; code turns that into an outcome.
        should_be = _text(data.get("should_be"), 20).upper().replace(" ", "_")
        doubt = _text(data.get("doubt"), 20).lower()
        outcome = policies.challenge_outcome(should_be, doubt, inv.judgement["decision"])
        would_change = []
        blocked = any(s["rule"] in BLOCKS_PROCEED for s in inv.signals.items)
        for item in data.get("would_change") or []:
            if not isinstance(item, dict):
                continue
            then = _text(item.get("then"), 20).upper().replace(" ", "_")
            if then == "PROCEED" and blocked:
                then = "VERIFY_FIRST"  # the guardrail would never allow a Proceed here, so don't promise one
            if cited(item.get("if"), 300) and then in DECISIONS:
                would_change.append({"if": cited(item.get("if"), 300), "check": cited(item.get("check"), 300), "then": then})
        strings = lambda key, n: [s for s in (cited(x, 300) for x in data.get(key) or []) if s][:n]  # noqa: E731

        # Findings the challenger says go beyond their sources stay in the report, marked as disputed.
        findings = inv.judgement["key_findings"]
        disputed = []
        for item in data.get("overstated_findings") or []:
            if not isinstance(item, dict):
                continue
            try:
                index = int(item.get("finding")) - 1
            except (TypeError, ValueError):
                continue
            why = cited(item.get("why"), 300)
            if 0 <= index < len(findings) and why and "disputed" not in findings[index]:
                findings[index]["disputed"] = why
                disputed.append({"finding": index, "text": findings[index]["text"], "why": why})
        if disputed:
            _log(inv.run, "challenge", f"Nemotron Super disputes {len(disputed)} of Ultra's findings as going beyond their sources", "warn")
        return {
            "outcome": outcome,
            "should_be": should_be if should_be in DECISIONS else inv.judgement["decision"],
            "doubt": doubt if doubt in ("none", "some", "serious") else "some",
            "counter_hypothesis": hypothesis,
            "searches": queries,
            "strongest_counterpoint": cited(data.get("strongest_counterpoint"), 600),
            "alternative_explanations": strings("alternative_explanations", 3),
            "would_change": would_change[:4],
            "unresolved": strings("unresolved", 4),
            "sources": [s["id"] for s in fresh],
            "disputed": disputed,
            "effect": None,
        }

    def _apply_challenge(self, inv: Investigation) -> str | None:
        """Apply the documented challenge rules (agent/policies.py) and log what changed."""
        effect = policies.apply_challenge(inv.judgement, inv.challenge or {}, inv.signals.items)
        if effect:
            _log(inv.run, "challenge", effect, "warn")
        return effect
