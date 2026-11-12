"""Accounts end to end: sign up, verify by code, sessions, reset, ownership, admin access, feedback, deletion."""
from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

PASSWORD = "correct horse battery"
MESSAGE = "Hi, we'd like to offer you a remote role. Please reply so we can set up a short call this week."


def signup(client: TestClient, rt: Any, email: str = "maya@example.com", name: str = "Maya Chen") -> None:
    response = client.post("/api/v1/auth/signup", json={"name": name, "email": email, "password": PASSWORD})
    assert response.status_code == 201, response.text
    code = rt.email.codes[(email.strip().lower(), "verify")]
    response = client.post("/api/v1/auth/verify", json={"email": email, "code": code})
    assert response.status_code == 200, response.text


def test_signup_verify_and_session(client: TestClient, rt: Any) -> None:
    signup(client, rt, email="Maya@Example.com ")
    me = client.get("/api/v1/auth/me").json()["user"]
    assert me["email"] == "maya@example.com" and me["verified"] and me["role"] == "user"
    stored = rt.db.dump("users")[0]
    assert stored["password_hash"].startswith("scrypt$") and PASSWORD not in stored["password_hash"]
    assert all(len(s["id"]) == 64 for s in rt.db.dump("sessions"))  # only token digests are stored
    client.post("/api/v1/auth/logout")
    assert client.get("/api/v1/auth/me").json()["user"] is None


def test_wrong_codes_run_out(client: TestClient, rt: Any) -> None:
    client.post("/api/v1/auth/signup", json={"name": "Lena", "email": "lena@example.com", "password": PASSWORD})
    real = rt.email.codes[("lena@example.com", "verify")]
    wrong = "000000" if real != "000000" else "111111"
    messages = [client.post("/api/v1/auth/verify", json={"email": "lena@example.com", "code": wrong}).json()["detail"]["message"] for _ in range(5)]
    assert messages[0].endswith("4 tries left.")
    # After five misses even the right code is refused; a new one has to be requested.
    response = client.post("/api/v1/auth/verify", json={"email": "lena@example.com", "code": real})
    assert response.status_code == 429


def test_unverified_accounts_cannot_sign_in(client: TestClient, rt: Any) -> None:
    client.post("/api/v1/auth/signup", json={"name": "Sam", "email": "sam@example.com", "password": PASSWORD})
    response = client.post("/api/v1/auth/login", json={"email": "sam@example.com", "password": PASSWORD})
    assert response.status_code == 403 and response.json()["detail"]["code"] == "unverified"


def test_login_rejects_bad_passwords_and_duplicate_signups(client: TestClient, rt: Any) -> None:
    signup(client, rt)
    client.post("/api/v1/auth/logout")
    assert client.post("/api/v1/auth/login", json={"email": "maya@example.com", "password": "nope-nope"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}).status_code == 401
    again = client.post("/api/v1/auth/signup", json={"name": "Maya", "email": "maya@example.com", "password": PASSWORD})
    assert again.status_code == 409
    assert client.post("/api/v1/auth/login", json={"email": "maya@example.com", "password": PASSWORD}).status_code == 200


def test_password_reset_signs_out_other_sessions(client: TestClient, rt: Any) -> None:
    signup(client, rt)
    assert client.post("/api/v1/auth/forgot", json={"email": "maya@example.com"}).status_code == 200
    code = rt.email.codes[("maya@example.com", "reset")]
    other = TestClient(client.app)
    other.post("/api/v1/auth/login", json={"email": "maya@example.com", "password": PASSWORD})
    response = client.post("/api/v1/auth/reset", json={"email": "maya@example.com", "code": code, "password": "a brand new password"})
    assert response.status_code == 200
    assert other.get("/api/v1/auth/me").json()["user"] is None
    assert client.post("/api/v1/auth/login", json={"email": "maya@example.com", "password": "a brand new password"}).status_code == 200


def test_forgot_password_doesnt_reveal_accounts(client: TestClient, rt: Any) -> None:
    assert client.post("/api/v1/auth/forgot", json={"email": "ghost@example.com"}).status_code == 200
    assert ("ghost@example.com", "reset") not in rt.email.codes


def test_runs_belong_to_their_owner(client: TestClient, rt: Any) -> None:
    signup(client, rt)
    run_id = client.post("/api/v1/investigations", json={"message": MESSAGE}).json()["id"]
    mine = client.get("/api/v1/me/investigations").json()
    assert [r["id"] for r in mine] == [run_id]
    stranger = TestClient(client.app)
    assert stranger.get("/api/v1/me/investigations").status_code == 401


def test_admin_area_is_for_admins_only(client: TestClient, rt: Any) -> None:
    signup(client, rt)
    assert client.get("/api/v1/admin/overview").status_code == 403
    admin = TestClient(client.app)
    signup(admin, rt, email="admin@example.com", name="Ada Admin")
    overview = admin.get("/api/v1/admin/overview").json()
    assert overview["stats"]["users"] == 2 and overview["health"]["api"]["status"] == "ok"
    users = admin.get("/api/v1/admin/users").json()
    assert {u["email"]: u["role"] for u in users} == {"maya@example.com": "user", "admin@example.com": "admin"}
    assert "password_hash" not in users[0]


def test_feedback_and_contact_reach_the_admin(client: TestClient, rt: Any) -> None:
    assert client.post("/api/v1/feedback", json={"investigation_id": "canonical-recruiter", "rating": 5, "comment": "Clear."}).status_code == 201
    assert client.post("/api/v1/feedback", json={"rating": 9}).status_code == 422
    sent = client.post("/api/v1/contact", json={"name": "Priya", "email": "priya@example.com", "topic": "press", "message": "Can we talk about this?"})
    assert sent.status_code == 201 and rt.email.notices
    admin = TestClient(client.app)
    signup(admin, rt, email="admin@example.com", name="Ada Admin")
    assert admin.get("/api/v1/admin/feedback").json()[0]["rating"] == 5
    assert admin.get("/api/v1/admin/messages").json()[0]["topic"] == "press"


def test_deleting_an_account_removes_its_data(client: TestClient, rt: Any) -> None:
    signup(client, rt)
    client.post("/api/v1/investigations", json={"message": MESSAGE})
    client.post("/api/v1/feedback", json={"rating": 4})
    assert client.delete("/api/v1/me").status_code == 200
    assert rt.db.dump("users") == [] and rt.db.dump("sessions") == []
    assert rt.db.dump("investigations") == [] and rt.db.dump("feedback") == []
    assert client.get("/api/v1/auth/me").json()["user"] is None


async def _make_demo_accounts(rt: Any) -> None:
    from app.core.security import hash_password
    from app.repositories.user_repo import now

    for email, name in ((rt.settings.demo_judge_email, "Demo Judge"), (rt.settings.demo_admin_email, "Demo Admin")):
        row = await rt.users.create(name, email, hash_password("demo-password"))
        await rt.users.update(row["id"], verified_at=now().isoformat())


def test_demo_judge_signs_in_with_one_click_and_is_protected(client: TestClient, rt: Any) -> None:
    import asyncio

    asyncio.run(_make_demo_accounts(rt))
    user = client.post("/api/v1/auth/demo", json={"kind": "judge"}).json()["user"]
    assert user["demo"] and user["role"] == "user"
    assert client.get("/api/v1/admin/overview").status_code == 403
    assert client.patch("/api/v1/me", json={"name": "Hacked"}).status_code == 403
    assert client.delete("/api/v1/me").status_code == 403
    assert client.post("/api/v1/auth/reset", json={"email": rt.settings.demo_judge_email, "code": "123456", "password": "new password 1"}).status_code == 403
    assert client.get("/api/v1/auth/me").json()["user"]["name"] == "Demo Judge"


def test_demo_admin_sees_the_dashboard_with_people_masked(client: TestClient, rt: Any) -> None:
    import asyncio

    signup(client, rt)  # a real person: maya@example.com
    client.post("/api/v1/contact", json={"name": "Maya Chen", "email": "maya@example.com", "topic": "question", "message": "Is this thing free?"})
    asyncio.run(_make_demo_accounts(rt))
    demo = TestClient(client.app)
    assert demo.post("/api/v1/auth/demo", json={"kind": "admin"}).json()["user"]["role"] == "admin"
    assert demo.get("/api/v1/admin/overview").status_code == 200
    emails = {u["email"] for u in demo.get("/api/v1/admin/users").json()}
    assert "maya@example.com" not in emails and "m•••@example.com" in emails
    assert rt.settings.demo_admin_email in emails  # the demo accounts themselves stay readable
    message = demo.get("/api/v1/admin/messages").json()[0]
    assert message["email"] == "m•••@example.com" and message["name"] == "M•••"


def test_demo_sign_in_creates_the_shared_account_on_first_use(client: TestClient, rt: Any) -> None:
    first = client.post("/api/v1/auth/demo", json={"kind": "judge"})
    assert first.status_code == 200
    user = first.json()["user"]
    assert user["email"] == rt.settings.demo_judge_email and user["verified"] and user["demo"]
    # A second sign-in reuses the same account rather than creating another.
    again = client.post("/api/v1/auth/demo", json={"kind": "judge"})
    assert again.json()["user"]["id"] == user["id"]


def test_demo_sign_in_can_be_switched_off(client: TestClient, rt: Any, monkeypatch: Any) -> None:
    monkeypatch.setattr(rt.settings, "demo_login", False)
    response = client.post("/api/v1/auth/demo", json={"kind": "judge"})
    assert response.status_code == 404 and response.json()["detail"]["code"] == "demo_off"
