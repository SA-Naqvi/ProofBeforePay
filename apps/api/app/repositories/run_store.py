"""Runs in memory, recorded examples, and the JSON copy of every finished run in data/runs."""
from __future__ import annotations

import json
import logging
import re
import uuid
from pathlib import Path
from typing import Any

from ..agent.state import Run

logger = logging.getLogger("proofbeforepay.store")

_RUN_ID = re.compile(r"^[a-z0-9-]{4,64}$")

_MAX_IN_MEMORY = 300

class RunStore:
    def __init__(self, data_dir: Path, examples_dir: Path) -> None:
        self.runs_dir = data_dir / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self._runs: dict[str, Run] = {}
        self.examples: dict[str, Run] = {}
        for path in sorted(examples_dir.glob("*.json")):
            try:
                run = Run.from_record(json.loads(path.read_text(encoding="utf-8")), example=True)
            except (OSError, ValueError, KeyError) as exc:
                logger.warning("Skipping example %s: %s", path.name, exc)
                continue
            self.examples[run.id] = run

    def create(self, input: dict[str, Any]) -> Run:
        run = Run(uuid.uuid4().hex[:12], input)
        self._runs[run.id] = run
        self._evict()
        run.set_status("queued")
        return run

    @staticmethod
    def valid_id(run_id: str) -> bool:
        return bool(_RUN_ID.match(run_id))

    def remember(self, run: Run) -> None:
        """Keep a run loaded from the database in memory, like any other recent run."""
        self._runs[run.id] = run
        self._evict()

    def get(self, run_id: str) -> Run | None:
        if not _RUN_ID.match(run_id):
            return None
        if run_id in self._runs:
            return self._runs[run_id]
        if run_id in self.examples:
            return self.examples[run_id]
        path = self.runs_dir / f"{run_id}.json"
        if path.is_file():
            run = Run.from_record(json.loads(path.read_text(encoding="utf-8")))
            self._runs[run.id] = run
            return run
        return None

    def persist(self, run: Run) -> None:
        path = self.runs_dir / f"{run.id}.json"
        try:
            path.write_text(json.dumps(run.to_record(), ensure_ascii=False), encoding="utf-8")
        except OSError as exc:
            logger.error("Could not persist run %s: %s", run.id, exc)

    def recent(self) -> list[Run]:
        """Runs held in memory (this server's recent live runs), newest first."""
        return sorted(self._runs.values(), key=lambda r: r.created_at, reverse=True)

    def discard(self, run_id: str) -> None:
        """Forget a run that never started (for example, the person couldn't pay for it)."""
        self._runs.pop(run_id, None)

    def list_examples(self) -> list[dict[str, Any]]:
        # Recordings made by the earlier job-offer pipeline (methodology 2 and older) stay readable by link, but aren't
        # offered as examples of what this supplier-verification product does.
        current = (r for r in self.examples.values() if (r.report or {}).get("version", 1) >= 3)
        return sorted((r.summary() for r in current), key=lambda s: s["created_at"], reverse=True)

    def _evict(self) -> None:
        finished = [r for r in self._runs.values() if r.finished]
        overflow = len(self._runs) - _MAX_IN_MEMORY
        for run in sorted(finished, key=lambda r: r.created_at)[: max(overflow, 0)]:
            self._runs.pop(run.id, None)
