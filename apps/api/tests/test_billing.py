"""Credits and PayPal checkout, with a fake gateway: no network, no real or sandbox money.

What matters: prices come from the server, credits are granted only after a verified capture, a payment can only be
applied once, nobody can capture someone else's order, checks cost credits, and a failed check is refunded.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main
from app.agent.state import Run
from app.core.config import CreditPack, settings
from app.core.security import SpendGuard
from app.db.memory import MemoryDatabase
from app.repositories.run_store import RunStore
from app.services import runtime
from app.services.paypal_gateway import PaymentError
from conftest import FakeEmail, FakePipeline

PASSWORD = "correct horse battery"
MESSAGE = "Proforma invoice from Brightstar Textile Co., Ltd. 100% payment in advance to the account of Mr. Li Wei."


class FakeGateway:
    def __init__(self) -> None:
        self.orders: list[dict[str, Any]] = []
        self.captures = 0
        self.outcome: dict[str, str] | None = None  # overrides what a capture reports
        self.fail_capture = False

    async def create_order(self, pack: CreditPack, *, reference: str, return_url: str, cancel_url: str) -> dict[str, str]:
        order = {"id": f"PAYPALORDER{len(self.orders) + 1}", "reference": reference, "pack": pack, "return_url": return_url}
        self.orders.append(order)
        return {"id": order["id"], "approve_url": f"https://www.sandbox.paypal.com/checkoutnow?token={order['id']}", "status": "PAYER_ACTION_REQUIRED"}

    async def capture_order(self, order_id: str, *, request_id: str) -> dict[str, str]:
        if self.fail_capture:
            raise PaymentError("PayPal couldn't complete that request. No money was taken. Please try again.")
        self.captures += 1
        order = next(o for o in self.orders if o["id"] == order_id)
        paid = {
            "order_status": "COMPLETED", "capture_status": "COMPLETED", "capture_id": f"CAP-{order_id}",
            "amount": order["pack"].price, "currency": "USD", "custom_id": order["reference"], "payer_email": "buyer@example.com",
        }
        return paid | (self.outcome or {})


class FailingPipeline:
    async def execute(self, run: Run) -> None:
        run.set_status("running")
        run.error = "boom"
        run.set_status("error", "boom")


@pytest.fixture
def gateway() -> FakeGateway:
    return FakeGateway()


def _build(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, gateway: FakeGateway, pipeline: Any = None) -> Any:
    monkeypatch.setattr(settings, "nebius_api_key", "test")
    monkeypatch.setattr(settings, "tavily_api_key", "test")
    monkeypatch.setattr(settings, "admin_emails", frozenset({"admin@example.com"}))
    monkeypatch.setattr(settings, "paypal_client_id", "sandbox-id")
    monkeypatch.setattr(settings, "paypal_client_secret", "sandbox-secret")
    monkeypatch.setattr(settings, "runs_per_ip_per_hour", 50)
    rt = runtime.build(
        settings, db=MemoryDatabase(), pipeline=pipeline or FakePipeline(), email=FakeEmail(),  # type: ignore[arg-type]
        store=RunStore(tmp_path, settings.examples_dir), budget=SpendGuard(tmp_path / "spend.json", 1.0, 0.15), gateway=gateway,  # type: ignore[arg-type]
    )
    monkeypatch.setattr(runtime, "current", rt)
    return rt


@pytest.fixture
def prt(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, gateway: FakeGateway) -> Any:
    return _build(tmp_path, monkeypatch, gateway)


def signed_in(rt: Any, email: str = "maya@example.com") -> TestClient:
    client = TestClient(main.app)
    assert client.post("/api/v1/auth/signup", json={"name": "Maya Chen", "email": email, "password": PASSWORD}).status_code == 201
    code = rt.email.codes[(email, "verify")]
    assert client.post("/api/v1/auth/verify", json={"email": email, "code": code}).status_code == 200
    return client


def buy(client: TestClient, pack_id: str = "starter") -> str:
    response = client.post("/api/v1/billing/orders", json={"pack_id": pack_id})
    assert response.status_code == 201, response.text
    return response.json()["order_id"]


def balance(client: TestClient) -> int:
    return client.get("/api/v1/billing").json()["balance"]


def test_packs_are_public_and_priced_by_the_server(client: TestClient, prt: Any) -> None:
    body = client.get("/api/v1/billing").json()
    assert body["enabled"] and body["environment"] == "sandbox" and body["cost_per_check"] == 1
    assert [p["id"] for p in body["packs"]] == ["starter", "standard", "bulk"]
    assert "balance" not in body  # signed out
    assert client.get("/api/v1/health").json()["payments"] == {"enabled": True, "environment": "sandbox"}


def test_buying_credits_end_to_end(prt: Any, gateway: FakeGateway) -> None:
    client = signed_in(prt)
    assert balance(client) == 0
    order_id = buy(client, "standard")
    assert gateway.orders[0]["pack"].price == "12.00" and gateway.orders[0]["return_url"].endswith("/billing?paid=1")
    result = client.post(f"/api/v1/billing/orders/{order_id}/capture")
    assert result.status_code == 200 and result.json() == {"status": "completed", "credits": 15, "balance": 15, "already_applied": False}
    assert balance(client) == 15
    stored = prt.db.dump("payment_orders")[0]
    assert stored["status"] == "completed" and stored["capture_id"] == f"CAP-{order_id}"


def test_the_browser_cannot_choose_a_price(prt: Any) -> None:
    client = signed_in(prt)
    response = client.post("/api/v1/billing/orders", json={"pack_id": "starter", "price": "0.01", "credits": 9999})
    assert response.status_code == 201
    assert client.post("/api/v1/billing/orders", json={"pack_id": "free-lunch"}).status_code == 400


def test_a_payment_can_only_be_applied_once(prt: Any, gateway: FakeGateway) -> None:
    client = signed_in(prt)
    order_id = buy(client)
    first = client.post(f"/api/v1/billing/orders/{order_id}/capture").json()
    second = client.post(f"/api/v1/billing/orders/{order_id}/capture").json()
    assert first["credits"] == 5 and second["credits"] == 0 and second["already_applied"]
    assert balance(client) == 5 and gateway.captures == 1


def test_nobody_can_capture_someone_elses_order(prt: Any) -> None:
    maya, sam = signed_in(prt), signed_in(prt, "sam@example.com")
    order_id = buy(maya)
    assert sam.post(f"/api/v1/billing/orders/{order_id}/capture").status_code == 404
    assert sam.post("/api/v1/billing/orders/NOSUCHORDER/capture").status_code == 404
    assert balance(sam) == 0 and balance(maya) == 0


@pytest.mark.parametrize(
    "outcome",
    [{"amount": "0.01"}, {"currency": "EUR"}, {"custom_id": "someone-elses-order"}, {"capture_status": "DECLINED"}, {"order_status": "APPROVED", "capture_status": ""}],
)
def test_a_payment_that_does_not_match_grants_nothing(prt: Any, gateway: FakeGateway, outcome: dict[str, str]) -> None:
    client = signed_in(prt)
    order_id = buy(client)
    gateway.outcome = outcome
    response = client.post(f"/api/v1/billing/orders/{order_id}/capture")
    assert response.status_code == 402 and response.json()["detail"]["code"] == "payment_failed"
    assert balance(client) == 0
    assert prt.db.dump("payment_orders")[0]["status"] == "failed"


def test_a_pending_payment_grants_nothing_yet(prt: Any, gateway: FakeGateway) -> None:
    client = signed_in(prt)
    order_id = buy(client)
    gateway.outcome = {"capture_status": "PENDING"}
    assert client.post(f"/api/v1/billing/orders/{order_id}/capture").json()["status"] == "pending"
    assert balance(client) == 0


def test_a_paypal_outage_is_reported_and_can_be_retried(prt: Any, gateway: FakeGateway) -> None:
    client = signed_in(prt)
    order_id = buy(client)
    gateway.fail_capture = True
    assert client.post(f"/api/v1/billing/orders/{order_id}/capture").status_code == 502
    gateway.fail_capture = False
    assert client.post(f"/api/v1/billing/orders/{order_id}/capture").json()["balance"] == 5


def test_checks_cost_credits(prt: Any, gateway: FakeGateway) -> None:
    client = signed_in(prt)
    response = client.post("/api/v1/investigations", json={"message": MESSAGE})
    assert response.status_code == 402 and "Buy credits" in response.json()["detail"]
    client.post(f"/api/v1/billing/orders/{buy(client)}/capture")
    assert client.post("/api/v1/investigations", json={"message": MESSAGE}).status_code == 201
    assert balance(client) == 4
    history = client.get("/api/v1/billing").json()["history"]
    assert {h["reason"] for h in history} == {"5 credits (starter pack)", "Supplier check"}


def test_signed_out_visitors_cannot_run_paid_checks(client: TestClient, prt: Any) -> None:
    response = client.post("/api/v1/investigations", json={"message": MESSAGE})
    assert response.status_code == 401 and "Sign in" in response.json()["detail"]


def test_a_failed_check_is_refunded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, gateway: FakeGateway) -> None:
    rt = _build(tmp_path, monkeypatch, gateway, FailingPipeline())
    client = signed_in(rt)
    client.post(f"/api/v1/billing/orders/{buy(client)}/capture")
    assert client.post("/api/v1/investigations", json={"message": MESSAGE}).status_code == 201
    assert balance(client) == 5  # charged 1, refunded 1
    reasons = [h["reason"] for h in client.get("/api/v1/billing").json()["history"]]
    assert "Refund: the check failed" in reasons


def test_admins_and_demo_accounts_do_not_spend_credits(prt: Any) -> None:
    admin = signed_in(prt, "admin@example.com")
    assert admin.post("/api/v1/investigations", json={"message": MESSAGE}).status_code == 201
    state = admin.get("/api/v1/billing").json()
    assert state["exempt"] and state["balance"] == 0


def test_welcome_credits_are_granted_once(prt: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "starting_credits", 2)
    client = signed_in(prt)
    assert balance(client) == 2 and balance(client) == 2


def test_everything_stays_free_when_paypal_is_not_configured(client: TestClient, rt: Any) -> None:
    assert client.get("/api/v1/billing").json()["enabled"] is False
    assert client.post("/api/v1/investigations", json={"message": MESSAGE}).status_code == 201
    signed = TestClient(main.app)
    assert signed.post("/api/v1/billing/orders", json={"pack_id": "starter"}).status_code == 401
