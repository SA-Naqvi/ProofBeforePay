"""The ProofBeforePay investigation: intake → investigate (a loop of lookups) → judgement → challenge → brief.

Model routing: Nano reads the paperwork, reads each lookup's pages and writes the brief; Super proposes extra lookups when
findings leave a question open; Ultra makes the single final judgement over everything; then Super argues against that
judgement with its own counter-searches, and code (agent/policies.py) decides what the challenge changes.
Whether two names, numbers or addresses agree is decided by code (agent/reconcile.py), never by a model.
Each step lives in app/intelligence; this class runs them in order.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ..intelligence.challenge_pass import ChallengePass
from ..intelligence.claim_extractor import ClaimExtractor
from ..intelligence.investigator import Investigator
from ..intelligence.judge import Judge
from ..intelligence.report_generator import ReportGenerator
from ..tools.adapters import ToolBox
from ..llm.nebius_client import LLMError
from .state import Investigation
from .workflow import PipelineError

if TYPE_CHECKING:
    from ..llm.nebius_client import LLMRouter
    from ..tools.tavily_search import WebResearch
    from .state import Run

logger = logging.getLogger("proofbeforepay.pipeline")

class Pipeline(ClaimExtractor, Investigator, Judge, ChallengePass, ReportGenerator):
    """Runs the five steps for one run and turns failures into a message the user can act on."""

    def __init__(
        self, llm: LLMRouter, web: WebResearch, max_claims: int = 8, *, tools: ToolBox | None = None, limits: dict[str, int] | None = None
    ) -> None:
        self.llm = llm
        self.web = web
        self.max_claims = max_claims
        self.tools = tools or ToolBox(web)
        # The loop's budget: rounds of lookups, total leads, and how many hops a lead may be from the original claim.
        self.limits = {"rounds": 4, "leads": 16, "depth": 3, **(limits or {})}

    async def execute(self, run: Run) -> None:
        run.set_status("running")
        inv = Investigation(run, max_leads=self.limits["leads"], max_depth=self.limits["depth"])
        try:
            await self._intake(inv)
            await self._investigate(inv)
            await self._judge(inv)
            await self._challenge(inv)
            await self._brief(inv)
            report = self._assemble(inv)
        except (LLMError, PipelineError) as exc:
            self._fail(run, str(exc))
            return
        except Exception:
            logger.exception("Run %s crashed", run.id)
            self._fail(run, "Something went wrong on our side. Please run the check again.")
            return
        run.report = report
        run.emit("report", report=report)
        run.set_status("done")

    @staticmethod
    def _fail(run: Run, message: str) -> None:
        run.error = message
        run.emit("error", message=message)
        run.set_status("error", message)

    # ── 1. Intake ────────────────────────────────────────────────────────────
