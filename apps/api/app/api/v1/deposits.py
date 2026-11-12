"""Verdict-gated supplier deposits through PayPal, the AI review that releases a hold, and PayPal's webhooks."""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ...models.user import User
from ...services import runtime
from ...services.deposit_service import DepositError
from ..deps import limit, require_user

logger = logging.getLogger("proofbeforepay.webhooks")
router = APIRouter(tags=["deposits"])


class StartDeposit(BaseModel):
    run_id: str = Field(min_length=1, max_length=80)
    amount: str = Field(min_length=1, max_length=16)
    payee_email: str | None = Field(default=None, max_length=254)
    note: str = Field(default="", max_length=300)


class ProofBody(BaseModel):
    proof: str = Field(min_length=20, max_length=6000)


class ReleaseBody(BaseModel):
    acknowledge_risk: bool = False


class TrackingBody(BaseModel):
    tracking_number: str = Field(min_length=4, max_length=64)
    carrier: str = Field(default="OTHER", max_length=64)


def _fail(exc: DepositError) -> HTTPException:
    return HTTPException(exc.status, {"message": exc.message, "code": exc.code})


@router.get("/investigations/{run_id}/payment")
async def payment_plan(run_id: str, user: User = Depends(require_user)) -> dict[str, Any]:
    """What this report allows: pay now (Proceed), hold (Verify first) or nothing (Stop), plus this buyer's deposits."""
    try:
        return await runtime.current.deposits.plan_for(user, run_id)
    except DepositError as exc:
        raise _fail(exc) from exc


@router.get("/deposits")
async def list_deposits(user: User = Depends(require_user)) -> list[dict[str, Any]]:
    return await runtime.current.deposits.list(user)


@router.post("/deposits", status_code=201)
async def start_deposit(body: StartDeposit, request: Request, user: User = Depends(require_user)) -> dict[str, Any]:
    """Create the PayPal order. The browser is sent to `approve_url`; the server decides pay vs hold from the report."""
    limit(request, "deposit")
    try:
        return await runtime.current.deposits.start(user, body.run_id, body.amount, body.payee_email, body.note)
    except DepositError as exc:
        raise _fail(exc) from exc


@router.post("/deposits/{deposit_id}/complete")
async def complete_deposit(deposit_id: str, request: Request, user: User = Depends(require_user)) -> dict[str, Any]:
    """After PayPal sends the buyer back: capture (pay) or authorize (hold) the approved order."""
    limit(request, "deposit")
    try:
        return await runtime.current.deposits.complete(user, deposit_id)
    except DepositError as exc:
        raise _fail(exc) from exc


@router.post("/deposits/{deposit_id}/review")
async def review_proof(deposit_id: str, body: ProofBody, request: Request, user: User = Depends(require_user)) -> dict[str, Any]:
    """Nemotron Super checks the supplier's reply against the report's open questions; payment rules have the last word."""
    limit(request, "review")
    try:
        return await runtime.current.deposits.review(user, deposit_id, body.proof)
    except DepositError as exc:
        raise _fail(exc) from exc


@router.post("/deposits/{deposit_id}/release")
async def release_deposit(deposit_id: str, body: ReleaseBody, request: Request, user: User = Depends(require_user)) -> dict[str, Any]:
    limit(request, "deposit")
    try:
        return await runtime.current.deposits.release(user, deposit_id, body.acknowledge_risk)
    except DepositError as exc:
        raise _fail(exc) from exc


@router.post("/deposits/{deposit_id}/cancel")
async def cancel_deposit(deposit_id: str, request: Request, user: User = Depends(require_user)) -> dict[str, Any]:
    limit(request, "deposit")
    try:
        return await runtime.current.deposits.cancel(user, deposit_id)
    except DepositError as exc:
        raise _fail(exc) from exc


@router.post("/deposits/{deposit_id}/tracking")
async def add_tracking(deposit_id: str, body: TrackingBody, request: Request, user: User = Depends(require_user)) -> dict[str, Any]:
    limit(request, "deposit")
    try:
        return await runtime.current.deposits.add_tracking(user, deposit_id, body.tracking_number, body.carrier)
    except DepositError as exc:
        raise _fail(exc) from exc


@router.post("/paypal/webhook")
async def paypal_webhook(request: Request) -> dict[str, str]:
    """PayPal's event notifications. Each delivery is verified with PayPal before anything changes."""
    rt = runtime.current
    if not rt.settings.payments_enabled or not rt.settings.paypal_webhook_id:
        raise HTTPException(503, "Webhooks aren't configured on this server.")
    raw = await request.body()
    if len(raw) > 200_000:
        raise HTTPException(413, "Payload too large.")
    try:
        event = json.loads(raw)
    except ValueError as exc:
        raise HTTPException(400, "Invalid JSON.") from exc
    if not isinstance(event, dict):
        raise HTTPException(400, "Invalid event.")
    headers = {k.lower(): v for k, v in request.headers.items()}
    if not await rt.deposits.gateway.verify_webhook(headers, event):
        logger.warning("Rejected an unverified PayPal webhook (%s)", event.get("event_type"))
        raise HTTPException(400, "Signature verification failed.")
    outcome = await rt.deposits.handle_webhook(event)
    logger.info("PayPal webhook %s %s: %s", event.get("event_type"), event.get("id"), outcome)
    return {"status": "ok"}
