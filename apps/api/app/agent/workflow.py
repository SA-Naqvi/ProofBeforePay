"""Plumbing shared by every step: user-safe errors, text cleanup, logging to the run, and timed stages."""
from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .state import Run

# The five steps, in order. The frontend's lib/stages.ts mirrors this list.
STAGES = ("intake", "investigate", "judge", "challenge", "brief")

class PipelineError(RuntimeError):
    """A failure whose message is safe and useful to show the user."""

def _text(value: Any, limit: int = 500) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() in ("null", "none", "n/a") else text[:limit]

def _squash(text: str) -> str:
    return " ".join(text.lower().split())

def _log(run: Run, stage_key: str, message: str, level: str = "info") -> None:
    run.emit("log", stage=stage_key, level=level, message=message)

@asynccontextmanager
async def stage(run: Run, key: str) -> AsyncIterator[None]:
    run.emit("stage", stage=key, state="start")
    started = time.monotonic()
    try:
        yield
    except BaseException:
        run.emit("stage", stage=key, state="error", duration_ms=round((time.monotonic() - started) * 1000))
        raise
    run.emit("stage", stage=key, state="done", duration_ms=round((time.monotonic() - started) * 1000))
