"""Step 5: Nemotron Ultra weighs everything once, with its reasoning streamed to the UI."""
from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Any

from ..agent import policies
from ..agent.policies import _REF, DECISIONS, POLARITIES
from ..agent.workflow import PipelineError, _log, _text, stage
from ..llm import prompts

if TYPE_CHECKING:
    from ..agent.state import Investigation


class Judge:
    """The single long-context reasoning pass that produces the verdict."""

    async def _judge(self, inv: Investigation) -> None:
        run = inv.run
        async with stage(run, "judge"):
            _log(
                run,
                "judge",
                f"Nemotron Ultra is weighing {len(inv.signals.items)} findings, {len(inv.claims)} claims, "
                f"{len(inv.case.leads)} lookups and {len(inv.sources.items)} sources",
            )
            messages = prompts.judge_messages(
                inv.offer, inv.profile, inv.signals.items, inv.claims, inv.case.leads, self._ranked_sources(inv)[:30], date.today().isoformat()
            )
            try:
                data = await self.llm.complete_json(
                    run,
                    tier="ultra",
                    step="judge",
                    messages=messages,
                    max_tokens=16000,
                    temperature=0.3,
                    thinking=True,
                    stream=True,
                    json_mode=False,
                )
            except ValueError as exc:
                raise PipelineError("The final assessment came back malformed. Please run the check again.") from exc
            if not isinstance(data, dict):
                raise PipelineError("The final assessment came back malformed. Please run the check again.")
            inv.judgement = self._clean_judgement(data, inv)
            run.emit("judgement", judgement=inv.judgement)

    @staticmethod
    def _ranked_sources(inv: Investigation) -> list[dict[str, Any]]:
        """Sources that findings and claims rest on come first, so the longest chains of evidence are never cut off."""
        cited = list(dict.fromkeys([sid for s in inv.signals.items for sid in s["sources"]] + [c["source_id"] for c in inv.claims if c["source_id"]]))
        first = [s for s in (inv.sources.get(i) for i in cited) if s]
        return first + [s for s in inv.sources.items if s not in first]

    def _clean_judgement(self, data: dict[str, Any], inv: Investigation) -> dict[str, Any]:
        known = (
            {s["id"] for s in inv.signals.items} | {c["id"] for c in inv.claims} | {s["id"] for s in inv.sources.items}
            | {lead["id"] for lead in inv.case.leads}
        )
        decision = _text(data.get("decision"), 30).upper().replace(" ", "_").replace("-", "_")
        if decision not in DECISIONS:
            decision = "VERIFY_FIRST"
        try:
            confidence = int(min(max(float(data.get("confidence", 50)), 0), 100))
        except (TypeError, ValueError):
            confidence = 50
        findings = []
        for item in data.get("key_findings") or []:
            if isinstance(item, dict) and _text(item.get("text")):
                polarity = _text(item.get("polarity"), 10).lower()
                refs = [r for r in (_text(x, 6).upper() for x in item.get("refs") or []) if _REF.match(r) and r in known]
                findings.append({"polarity": polarity if polarity in POLARITIES else "amber", "text": _text(item.get("text"), 400), "refs": refs})
        strings = lambda key, n: [s for s in (_text(x, 300) for x in (data.get(key) or [])) if s][:n]  # noqa: E731

        decision, guardrail = policies.guardrail(decision, inv.signals.items)
        if guardrail:
            _log(inv.run, "judge", guardrail, "warn")

        return {
            "decision": decision,
            "confidence": confidence,
            "headline": _text(data.get("headline"), 300),
            "assessment": _text(data.get("assessment"), 2500),
            "key_findings": findings[:8],
            "do_not": strings("do_not", 5),
            "next_step": _text(data.get("next_step"), 400),
            "verification_questions": strings("verification_questions", 5),
            "limitations": _text(data.get("limitations"), 600),
            "guardrail": guardrail,
        }

    # ── 6. Challenge ─────────────────────────────────────────────────────────
