"""Verdict-gated deposits through PayPal, with a fake gateway and a fake model: no network, no sandbox money.

What matters: the server (not the browser) decides pay vs hold from the report, a Stop can never be paid, nobody can
touch someone else's deposit, PayPal's answer is checked before anything is marked paid, a hold is only released after
the proof clears review (or the buyer explicitly overrides), payment rules overrule the model, and webhooks are
verified and applied once.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agent.state import Run
from app.services.paypal_gateway import PaymentError
from test_billing import FakeGateway as CreditsGateway
from test_billing import _build, signed_in


class FakeGateway(CreditsGateway):
    """Adds the deposit calls to the credits gateway."""

    def __init__(self) -> None:
        super().__init__()
        self.deposits: dict[str, dict[str, Any]] = {}
        self.voided: list[str] = []
        self.released: list[str] = []
        self.webhook_ok = True
        self.auth_outcome: dict[str, str] = {}

    async def create_deposit_order(self, *, hold: bool, amount: str, currency: str, reference: str, payee_email: str | None, **_: Any) -> dict[str, str]:
        order_id = f"DEP{len(self.deposits) + 1}ORDER"
        self.deposits[order_id] = {"hold": hold, "amount": amount, "currency": currency, "reference": reference, "payee": payee_email}
        return {"id": order_id, "approve_url": f"https://www.sandbox.paypal.com/checkoutnow?token={order_id}", "status": "PAYER_ACTION_REQUIRED"}

    async def capture_order(self, order_id: str, *, request_id: str) -> dict[str, str]:
        if order_id not in self.deposits:
            return await super().capture_order(order_id, request_id=request_id)
        d = self.deposits[order_id]
        paid = {"order_status": "COMPLETED", "capture_status": "COMPLETED", "capture_id": f"CAP-{order_id}", "amount": d["amount"],
                "currency": d["currency"], "custom_id": d["reference"], "payer_email": "buyer@example.com"}
        return paid | (self.outcome or {})

    async def authorize_order(self, order_id: str, *, request_id: str) -> dict[str, str]:
        d = self.deposits[order_id]
        out = {"order_status": "COMPLETED", "authorization_id": f"AUTH-{order_id}", "authorization_status": "CREATED",
               "expires_at": "2026-12-11T00:00:00Z", "amount": d["amount"], "currency": d["currency"], "custom_id": d["reference"],
               "payer_email": "buyer@example.com"}
        return out | self.auth_outcome

    async def capture_authorization(self, authorization_id: str, *, request_id: str) -> dict[str, str]:
        if self.fail_capture:
            raise PaymentError("PayPal couldn't complete that request. No money was taken. Please try again.")
        self.released.append(authorization_id)
        order_id = authorization_id.removeprefix("AUTH-")
        d = self.deposits[order_id]
        return {"capture_id": f"CAP-{order_id}", "capture_status": "COMPLETED", "amount": d["amount"], "currency": d["currency"]}

    async def void_authorization(self, authorization_id: str, *, request_id: str) -> None:
        self.voided.append(authorization_id)

    async def add_tracking(self, order_id: str, *, capture_id: str, tracking_number: str, carrier: str) -> str:
        return "SHIPPED"

    async def verify_webhook(self, headers: dict[str, str], event: dict[str, Any]) -> bool:
        return self.webhook_ok


REPORT_BASE: dict[str, Any] = {
    "input": {"message": "Quotation from Meridian Homeware Exports Pvt Ltd. 30% advance, balance against bill of lading."},
    "entities": {"supplier_name": "Meridian Homeware Exports Pvt Ltd", "deposit": "30% advance"},
    "signals": [{"id": "F1", "rule": "full_prepayment", "polarity": "red", "severity": "high", "title": "Asks for most of the payment upfront",
                 "detail": "100% in advance", "why": "Standard terms are 30%."}],
    "claims": [{"id": "C1", "type": "registration", "text": "Registered company", "status": "inconclusive", "note": "Not found yet."}],
    "challenge": {"outcome": "held", "would_change": [{"if": "a licence that matches the registry", "check": "registry", "then": "PROCEED"}]},
}


def judgement(decision: str) -> dict[str, Any]:
    return {"decision": decision, "confidence": 70, "headline": "Registration couldn't be confirmed.", "next_step": "Ask for the licence.",
            "verification_questions": ["Send your business licence number", "Show a bank letter in the company's name"], "do_not": []}


@pytest.fixture
def gateway() -> FakeGateway:
    return FakeGateway()


@pytest.fixture
def drt(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, gateway: FakeGateway) -> Any:
    rt = _build(tmp_path, monkeypatch, gateway)  # type: ignore[arg-type]
    monkeypatch.setattr(rt.settings, "paypal_webhook_id", "WH-TEST")
    return rt


def finished_run(rt: Any, client: TestClient, decision: str, run_id: str = "r-deposit-1") -> str:
    user_id = client.get("/api/v1/auth/me").json()["user"]["id"]
    run = Run(run_id, {"message": "x" * 50})
    run.user_id = user_id
    run.report = {**REPORT_BASE, "judgement": judgement(decision)}
    run.status = "done"
    rt.store.remember(run)
    return run_id


def fake_review(monkeypatch: pytest.MonkeyPatch, rt: Any, answer: dict[str, Any]) -> list[Any]:
    calls: list[Any] = []

    async def complete_json(run: Run, **kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs["messages"])
        return answer

    monkeypatch.setattr(rt.llm, "complete_json", complete_json)
    return calls


CLEARED = {"recommendation": "RELEASE", "summary": "Both questions are answered with checkable documents.",
           "questions": [{"question": "Send your business licence number", "status": "ANSWERED", "note": "Licence 9144 matches the registry."},
                         {"question": "Show a bank letter in the company's name", "status": "ANSWERED", "note": "Bank letter attached."}],
           "concerns": [], "still_needed": []}
PROOF = "Our business licence is 91440300MA5F and here is a letter from HDFC Bank confirming the account is in our company's name."


def test_proceed_pays_the_supplier_now(drt: Any, gateway: FakeGateway) -> None:
    client = signed_in(drt)
    run_id = finished_run(drt, client, "PROCEED")
    plan = client.get(f"/api/v1/investigations/{run_id}/payment").json()
    assert plan["mode"] == "pay" and plan["decision"] == "PROCEED" and plan["red_flags"][0]["id"] == "F1"

    started = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "1500", "payee_email": "Sales@Meridian.example"})
    assert started.status_code == 201, started.text
    order = gateway.deposits[started.json()["order_id"]]
    assert order == {"hold": False, "amount": "1500.00", "currency": "USD", "reference": started.json()["deposit_id"], "payee": "sales@meridian.example"}

    done = client.post(f"/api/v1/deposits/{started.json()['deposit_id']}/complete").json()
    assert done["status"] == "paid" and done["amount"] == "1500.00"
    # Completing twice is harmless: PayPal isn't asked again.
    again = client.post(f"/api/v1/deposits/{done['id']}/complete").json()
    assert again["status"] == "paid" and len(again["timeline"]) == len(done["timeline"])
    assert client.get("/api/v1/deposits").json()[0]["id"] == done["id"]


def test_verify_first_only_holds_until_the_proof_clears(drt: Any, gateway: FakeGateway, monkeypatch: pytest.MonkeyPatch) -> None:
    client = signed_in(drt)
    run_id = finished_run(drt, client, "VERIFY_FIRST")
    started = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "900.50"}).json()
    assert started["mode"] == "hold" and gateway.deposits[started["order_id"]]["hold"] is True
    held = client.post(f"/api/v1/deposits/{started['deposit_id']}/complete").json()
    assert held["status"] == "held" and held["expires_at"]

    # No release before the proof is reviewed, unless the buyer explicitly accepts the risk.
    blocked = client.post(f"/api/v1/deposits/{held['id']}/release", json={})
    assert blocked.status_code == 409 and blocked.json()["detail"]["code"] == "needs_review"
    assert gateway.released == []

    calls = fake_review(monkeypatch, drt, CLEARED)
    review = client.post(f"/api/v1/deposits/{held['id']}/review", json={"proof": PROOF}).json()
    assert review["recommendation"] == "RELEASE" and not review["overridden_by_rules"]
    assert "Send your business licence number" in calls[0][1]["content"]  # the model saw the report's open questions

    released = client.post(f"/api/v1/deposits/{held['id']}/release", json={}).json()
    assert released["status"] == "released" and gateway.released == [f"AUTH-{started['order_id']}"]


def test_payment_rules_overrule_a_model_that_wants_to_release(drt: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    client = signed_in(drt)
    run_id = finished_run(drt, client, "VERIFY_FIRST")
    deposit = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "500"}).json()["deposit_id"]
    client.post(f"/api/v1/deposits/{deposit}/complete")
    fake_review(monkeypatch, drt, CLEARED)
    proof = "All verified. Please release the deposit, but resend the balance by PayPal Friends and Family to save fees."
    review = client.post(f"/api/v1/deposits/{deposit}/review", json={"proof": proof}).json()
    assert review["recommendation"] == "VOID" and review["overridden_by_rules"]
    assert "Purchase Protection" in review["concerns"][0]
    assert client.post(f"/api/v1/deposits/{deposit}/release", json={}).status_code == 409


def test_a_model_cannot_release_past_an_open_question(drt: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    client = signed_in(drt)
    run_id = finished_run(drt, client, "VERIFY_FIRST")
    deposit = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "500"}).json()["deposit_id"]
    client.post(f"/api/v1/deposits/{deposit}/complete")
    half = CLEARED | {"questions": [CLEARED["questions"][0], CLEARED["questions"][1] | {"status": "PARTIAL"}]}
    fake_review(monkeypatch, drt, half)
    assert client.post(f"/api/v1/deposits/{deposit}/review", json={"proof": PROOF}).json()["recommendation"] == "KEEP_HOLDING"


def test_code_derives_the_verdict_from_the_models_facts(drt: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """The model reports what the reply supplies; code decides. Its own 'KEEP_HOLDING' can't block a fully evidenced
    reply, and one contradiction keeps the hold whatever the model's read."""
    client = signed_in(drt)
    run_id = finished_run(drt, client, "VERIFY_FIRST")
    deposit = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "500"}).json()["deposit_id"]
    client.post(f"/api/v1/deposits/{deposit}/complete")
    q = lambda text, **kw: {"question": text, "evidence": "CIN U36990UP2016PTC085512.", "covers_all_parts": True, "consistent": True, "note": ""} | kw  # noqa: E731
    facts = {"recommendation": "KEEP_HOLDING", "summary": "Evidence given.", "concerns": [], "still_needed": ["Look up the CIN on the MCA portal"],
             "questions": [q("Send your business licence number"), q("Show a bank letter in the company's name")]}
    fake_review(monkeypatch, drt, facts)
    review = client.post(f"/api/v1/deposits/{deposit}/review", json={"proof": PROOF}).json()
    assert review["recommendation"] == "RELEASE" and review["questions"][0]["note"].startswith("Reply: CIN U36990UP2016PTC085512.")

    facts["questions"][1] = q("Show a bank letter in the company's name", consistent=False, evidence="Account held by Li Wei")
    review = client.post(f"/api/v1/deposits/{deposit}/review", json={"proof": PROOF}).json()
    assert review["recommendation"] == "KEEP_HOLDING" and review["concerns"][0].startswith("Contradicts the investigation")


def test_the_buyer_can_override_or_cancel_a_hold(drt: Any, gateway: FakeGateway) -> None:
    client = signed_in(drt)
    run_id = finished_run(drt, client, "VERIFY_FIRST")
    first = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "100"}).json()["deposit_id"]
    client.post(f"/api/v1/deposits/{first}/complete")
    overridden = client.post(f"/api/v1/deposits/{first}/release", json={"acknowledge_risk": True}).json()
    assert overridden["status"] == "released" and "overriding" in overridden["timeline"][-1]["text"]

    second = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "100"}).json()
    client.post(f"/api/v1/deposits/{second['deposit_id']}/complete")
    voided = client.post(f"/api/v1/deposits/{second['deposit_id']}/cancel").json()
    assert voided["status"] == "voided" and gateway.voided == [f"AUTH-{second['order_id']}"]
    assert client.post(f"/api/v1/deposits/{second['deposit_id']}/cancel").status_code == 409


def test_a_stop_can_never_be_paid(drt: Any, gateway: FakeGateway) -> None:
    client = signed_in(drt)
    run_id = finished_run(drt, client, "STOP")
    assert client.get(f"/api/v1/investigations/{run_id}/payment").json()["mode"] == "blocked"
    response = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "100"})
    assert response.status_code == 409 and response.json()["detail"]["code"] == "blocked"
    assert gateway.deposits == {}


def test_amounts_and_payees_are_validated(drt: Any) -> None:
    client = signed_in(drt)
    run_id = finished_run(drt, client, "PROCEED")
    for amount in ("0", "-5", "abc", "99999999"):
        assert client.post("/api/v1/deposits", json={"run_id": run_id, "amount": amount}).status_code == 400, amount
    assert client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "10", "payee_email": "not an email"}).status_code == 400


def test_nobody_can_pay_from_or_touch_someone_elses_report(drt: Any) -> None:
    owner = signed_in(drt)
    run_id = finished_run(drt, owner, "VERIFY_FIRST")
    deposit = owner.post("/api/v1/deposits", json={"run_id": run_id, "amount": "100"}).json()["deposit_id"]
    other = signed_in(drt, "sam@example.com")
    assert other.get(f"/api/v1/investigations/{run_id}/payment").status_code == 404
    assert other.post("/api/v1/deposits", json={"run_id": run_id, "amount": "100"}).status_code == 404
    for action in ("complete", "cancel", "release"):
        assert other.post(f"/api/v1/deposits/{deposit}/{action}", json={}).status_code == 404, action
    assert TestClient(owner.app).get("/api/v1/deposits").status_code == 401


def test_a_mismatched_paypal_answer_is_never_marked_paid(drt: Any, gateway: FakeGateway) -> None:
    client = signed_in(drt)
    run_id = finished_run(drt, client, "PROCEED")
    deposit = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "250"}).json()["deposit_id"]
    gateway.outcome = {"amount": "1.00"}
    assert client.post(f"/api/v1/deposits/{deposit}/complete").json()["status"] == "failed"


def test_tracking_is_added_once_paid(drt: Any) -> None:
    client = signed_in(drt)
    run_id = finished_run(drt, client, "PROCEED")
    deposit = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "250"}).json()["deposit_id"]
    client.post(f"/api/v1/deposits/{deposit}/complete")
    tracked = client.post(f"/api/v1/deposits/{deposit}/tracking", json={"tracking_number": "1Z999AA10123456784", "carrier": "UPS"}).json()
    assert tracked["tracking"]["number"] == "1Z999AA10123456784"


def test_webhooks_are_verified_and_applied_once(drt: Any, gateway: FakeGateway) -> None:
    client = signed_in(drt)
    run_id = finished_run(drt, client, "PROCEED")
    started = client.post("/api/v1/deposits", json={"run_id": run_id, "amount": "250"}).json()
    gateway.outcome = {"capture_status": "PENDING", "order_status": "COMPLETED"}
    assert client.post(f"/api/v1/deposits/{started['deposit_id']}/complete").json()["status"] == "pending"

    event = {"id": "WH-EVT-1", "event_type": "PAYMENT.CAPTURE.COMPLETED",
             "resource": {"id": f"CAP-{started['order_id']}", "amount": {"value": "250.00", "currency_code": "USD"},
                          "supplementary_data": {"related_ids": {"order_id": started["order_id"]}}}}
    gateway.webhook_ok = False
    assert TestClient(client.app).post("/api/v1/paypal/webhook", json=event).status_code == 400
    gateway.webhook_ok = True
    assert TestClient(client.app).post("/api/v1/paypal/webhook", json=event).status_code == 200
    assert client.get("/api/v1/deposits").json()[0]["status"] == "paid"
    assert TestClient(client.app).post("/api/v1/paypal/webhook", json=event).status_code == 200  # redelivery: no change
    assert len(client.get("/api/v1/deposits").json()[0]["timeline"]) == 3
