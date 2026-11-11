"""Start investigations, read them, and stream their events (live, or replayed at their original pace)."""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ...agent.state import TERMINAL_STATUSES, Run
from ...models.user import User
from ...schemas.investigation import InvestigationRequest
from ...services import runtime
from ...services.investigation_service import ServiceError
from ..deps import client_ip, optional_user

router = APIRouter(tags=["investigations"])


async def get_run(run_id: str) -> Run:
    run = await runtime.current.investigations.find(run_id)
    if run is None:
        raise HTTPException(404, "Investigation not found.")
    return run


@router.get("/examples")
async def examples() -> list[dict[str, Any]]:
    return runtime.current.store.list_examples()


@router.post("/investigations", status_code=201)
async def create_investigation(
    body: InvestigationRequest, request: Request, user: User | None = Depends(optional_user)
) -> dict[str, str]:
    try:
        run = await runtime.current.investigations.start(body.model_dump(), client_ip(request), user)
    except ServiceError as exc:
        raise HTTPException(exc.status, exc.message) from exc
    return {"id": run.id}


@router.get("/investigations/{run_id}")
async def get_investigation(run_id: str) -> dict[str, Any]:
    run = await get_run(run_id)
    return {**run.summary(), "report": run.report}


@router.get("/investigations/{run_id}/events")
async def investigation_events(run_id: str, request: Request, replay: float = 0.0) -> StreamingResponse:
    """Server-sent events. Live runs stream as they happen; finished runs replay, optionally paced (replay=speed)."""
    run = await get_run(run_id)
    last_id = request.headers.get("last-event-id", "")
    start = int(last_id) + 1 if last_id.isdigit() else 0
    speed = min(max(replay, 0.0), 50.0)
    return StreamingResponse(
        _event_stream(run, start, speed, request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


def _sse(event: dict[str, Any]) -> str:
    return f"id: {event['seq']}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"


async def _event_stream(run: Run, start: int, speed: float, request: Request) -> AsyncIterator[str]:
    yield "retry: 3000\n\n"
    if run.finished:
        previous: float | None = None
        for event in run.events[start:]:
            if speed and previous is not None:
                gap = min((event["t"] - previous) / speed, 1.2)
                if gap > 0.005:
                    await asyncio.sleep(gap)
            previous = event["t"]
            if await request.is_disconnected():
                return
            yield _sse(event)
        return

    queue = run.subscribe()  # subscribe before snapshotting so nothing falls between the two
    try:
        last_seq = start - 1
        for event in run.events[start:]:
            yield _sse(event)
            last_seq = event["seq"]
        if run.finished:
            return
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15)
            except TimeoutError:
                yield ": keep-alive\n\n"
                continue
            if event["seq"] <= last_seq:
                continue
            yield _sse(event)
            last_seq = event["seq"]
            if event["type"] == "status" and event["status"] in TERMINAL_STATUSES:
                return
    finally:
        run.unsubscribe(queue)
