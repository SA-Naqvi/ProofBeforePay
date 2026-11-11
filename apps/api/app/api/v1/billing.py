"""Credits and PayPal checkout: what's for sale, the signed-in user's balance, starting and finishing a purchase."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ...models.user import User
from ...services import runtime
from ...services.billing_service import BillingError
from ..deps import limit, optional_user, require_user

router = APIRouter(prefix="/billing", tags=["billing"])


class OrderRequest(BaseModel):
    pack_id: str = Field(min_length=1, max_length=40)


@router.get("")
async def billing_state(user: User | None = Depends(optional_user)) -> dict[str, Any]:
    return await runtime.current.billing.state(user)


@router.post("/orders", status_code=201)
async def create_order(body: OrderRequest, request: Request, user: User = Depends(require_user)) -> dict[str, str]:
    """Start a PayPal checkout for a credit pack. The browser is sent to `approve_url` to pay."""
    limit(request, "billing")
    try:
        return await runtime.current.billing.start_checkout(user, body.pack_id)
    except BillingError as exc:
        raise HTTPException(exc.status, {"message": exc.message, "code": exc.code}) from exc


@router.post("/orders/{paypal_order_id}/capture")
async def capture_order(paypal_order_id: str, request: Request, user: User = Depends(require_user)) -> dict[str, Any]:
    """Finish a purchase after PayPal sends the buyer back. The server captures and verifies the payment itself."""
    limit(request, "billing")
    if not paypal_order_id.isalnum() or len(paypal_order_id) > 40:
        raise HTTPException(404, {"message": "We couldn't find that payment.", "code": "billing"})
    try:
        return await runtime.current.billing.capture(user, paypal_order_id)
    except BillingError as exc:
        raise HTTPException(exc.status, {"message": exc.message, "code": exc.code}) from exc
