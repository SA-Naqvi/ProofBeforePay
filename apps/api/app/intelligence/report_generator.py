"""Step 7: the brief and safe reply (Nano), and the final report with its telemetry."""
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

from ..agent.policies import METHODOLOGY_VERSION
from ..agent.workflow import _log, _text, stage
from ..core.config import Tier
from ..llm import prompts
from ..llm.nebius_client import LLMError
from ..tools.tavily_search import SourceRegistry

if TYPE_CHECKING:
    from ..agent.state import Investigation


class ReportGenerator:
    """Writes the brief and assembles the report."""

    async def _brief(self, inv: Investigation) -> None:
        run = inv.run
        async with stage(run, "brief"):
            _log(run, "brief", "Nemotron Nano is writing your decision brief and a safe reply")
            data: Any = {}
            try:
                data = await self.llm.complete_json(
                    run, tier="nano", step="brief", messages=prompts.brief_messages(inv.offer, inv.judgement),
                    max_tokens=900, temperature=0.4,
                )
            except (LLMError, ValueError) as exc:
                _log(run, "brief", f"Brief generation failed ({exc}); using the investigator's headline", "warn")
            data = data if isinstance(data, dict) else {}
            reply = data.get("reply") if isinstance(data.get("reply"), dict) else {}
            inv.brief = {
                "tldr": _text(data.get("tldr"), 600) or inv.judgement["headline"],
                "reply": {"subject": _text(reply.get("subject"), 150), "body": _text(reply.get("body"), 1500)},
            }

    def _assemble(self, inv: Investigation) -> dict[str, Any]:
        for signal in inv.signals.items:
            signal["chain"] = inv.case.chain(signal)  # the hops that led to this finding
        return {
            "version": METHODOLOGY_VERSION,
            "input": inv.offer,
            "generated_at": time.time(),
            "entities": inv.profile,
            "identities": list(inv.identities.values()),
            "signals": inv.signals.items,
            "claims": inv.claims,
            "leads": inv.case.public(),
            "rounds": inv.rounds,
            "stop_reason": inv.stop_reason,
            "judgement": inv.judgement,
            "challenge": inv.challenge,
            "brief": inv.brief,
            "sources": [SourceRegistry.public(s) for s in inv.sources.items],
            "telemetry": summarize_telemetry(inv.run.events, self.llm.tiers, time.monotonic() - inv.started),
        }


def summarize_telemetry(events: list[dict[str, Any]], tiers: dict[str, Tier], duration_s: float) -> dict[str, Any]:
    per_tier = {
        name: {"label": t.label, "model": t.model, "calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0, "latency_ms": 0}
        for name, t in tiers.items()
    }
    calls: list[dict[str, Any]] = []
    tavily: dict[str, Any] = {"calls": 0, "credits": 0.0, "by_kind": {}}
    cost = baseline = 0.0
    for event in events:
        if event["type"] == "llm_call":
            call = event["call"]
            calls.append(call)
            bucket = per_tier[call["tier"]]
            bucket["calls"] += 1
            bucket["prompt_tokens"] += call["prompt_tokens"]
            bucket["completion_tokens"] += call["completion_tokens"]
            bucket["cost_usd"] += call["cost_usd"]
            bucket["latency_ms"] += call["latency_ms"]
            cost += call["cost_usd"]
            baseline += call["baseline_cost_usd"]
        elif event["type"] == "tavily_call":
            call = event["call"]
            tavily["calls"] += 1
            tavily["credits"] += call["credits"]
            tavily["by_kind"][call["kind"]] = tavily["by_kind"].get(call["kind"], 0) + 1
    return {
        "tiers": per_tier,
        "calls": calls,
        "cost_usd": cost,
        "baseline_cost_usd": baseline,
        "savings_pct": round((1 - cost / baseline) * 100, 1) if baseline else 0.0,
        "tavily": tavily,
        "duration_s": round(duration_s, 1),
    }
