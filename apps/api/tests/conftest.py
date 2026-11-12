"""Shared fixtures. No test calls a real model, search API, registry, database or email service."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
from app.agent.state import Run  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import SpendGuard  # noqa: E402
from app.db.memory import MemoryDatabase  # noqa: E402
from app.repositories.run_store import RunStore  # noqa: E402
from app.services import runtime  # noqa: E402


@pytest.fixture
def run() -> Run:
    return Run("test-run", {"message": "x" * 50, "sender": "", "channel": ""})


class FakePipeline:
    async def execute(self, run: Run) -> None:
        run.set_status("running")
        run.emit("llm_call", call={"cost_usd": 0.02})
        run.report = {"judgement": {"decision": "VERIFY_FIRST", "headline": "Check first."}, "entities": {}}
        run.set_status("done")


class FakeEmail:
    """Captures what would have been emailed."""

    configured = True

    def __init__(self) -> None:
        self.codes: dict[tuple[str, str], str] = {}
        self.notices: list[str] = []

    async def send_code(self, to: str, name: str, code: str, purpose: str) -> None:
        self.codes[(to, purpose)] = code

    async def notify_admins(self, subject: str, text: str) -> None:
        self.notices.append(subject)

    async def close(self) -> None:
        return None


@pytest.fixture
def rt(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    """A runtime with an in-memory database, a fake pipeline and a fake email sender. No lifespan runs."""
    monkeypatch.setattr(settings, "nebius_api_key", "test")
    monkeypatch.setattr(settings, "tavily_api_key", "test")
    monkeypatch.setattr(settings, "admin_emails", frozenset({"admin@example.com"}))
    # Payments start switched off whatever the developer's .env says; payment tests switch them on with a fake gateway.
    monkeypatch.setattr(settings, "paypal_client_id", "")
    monkeypatch.setattr(settings, "paypal_client_secret", "")
    monkeypatch.setattr(settings, "paypal_webhook_id", "")
    test_runtime = runtime.build(
        settings,
        db=MemoryDatabase(),
        pipeline=FakePipeline(),  # type: ignore[arg-type]
        email=FakeEmail(),  # type: ignore[arg-type]
        store=RunStore(tmp_path, settings.examples_dir),
        budget=SpendGuard(tmp_path / "spend.json", 1.0, 0.15),
    )
    monkeypatch.setattr(runtime, "current", test_runtime)
    return test_runtime


@pytest.fixture
def client(rt: Any) -> TestClient:
    return TestClient(main.app)
