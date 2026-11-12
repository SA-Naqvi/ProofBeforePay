"""Accounts: sign up, verify the email with a one-time code, sign in, reset a password, and sessions.

Codes are six digits, valid for 10 minutes, five tries each, and stored only as an HMAC. Sessions are random tokens
stored only as a SHA-256 digest and sent as an HttpOnly cookie.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from ..core.config import Settings
from ..core.security import code_digest, hash_password, new_code, new_token, same_digest, token_digest, verify_password
from ..models.user import User
from ..repositories.feedback_repo import FeedbackRepo
from ..repositories.investigation_repo import InvestigationRepo
from ..repositories.user_repo import UserRepo, now, parse
from .email_service import EmailService

CODE_TTL = timedelta(minutes=10)
CODE_ATTEMPTS = 5
RESEND_AFTER = timedelta(seconds=45)
SESSION_TTL = timedelta(days=30)
# Published in the README so judges can also sign in by hand. Demo accounts can't be renamed, reset or deleted.
DEMO_PASSWORD = "ProofBeforePay-Demo-2026"


class AuthError(Exception):
    def __init__(self, status: int, message: str, code: str = "") -> None:
        super().__init__(message)
        self.status, self.message, self.code = status, message, code


class AuthService:
    def __init__(self, users: UserRepo, runs: InvestigationRepo, feedback: FeedbackRepo, email: EmailService, settings: Settings) -> None:
        self.users, self.runs, self.feedback, self.email, self.settings = users, runs, feedback, email, settings

    def user(self, row: dict[str, Any]) -> User:
        return User.from_row(row, self.settings.admin_emails, (self.settings.demo_judge_email, self.settings.demo_admin_email))

    def _is_demo_email(self, email: str) -> bool:
        return email.lower() in (self.settings.demo_judge_email, self.settings.demo_admin_email)

    @staticmethod
    def _not_demo(user: User) -> None:
        if user.demo:
            raise AuthError(403, "This is the shared demo account, so it can't be changed. Create your own account to try this.", "demo")

    async def _send_code(self, row: dict[str, Any], purpose: str) -> None:
        latest = await self.users.latest_code(row["id"], purpose)
        created = parse(latest["created_at"]) if latest else None
        if created and now() - created < RESEND_AFTER and not latest.get("consumed_at"):
            wait = int((RESEND_AFTER - (now() - created)).total_seconds()) + 1
            raise AuthError(429, f"We just sent a code. You can ask for another in {wait} seconds.", "cooldown")
        code = new_code()
        await self.users.add_code(row["id"], purpose, code_digest(code, row["id"], self.settings.auth_secret), CODE_TTL)
        await self.email.send_code(row["email"], row.get("name") or "", code, purpose)

    async def _check_code(self, row: dict[str, Any], purpose: str, code: str) -> None:
        latest = await self.users.latest_code(row["id"], purpose)
        if not latest or latest.get("consumed_at"):
            raise AuthError(400, "That code isn't valid any more. Ask for a new one.", "no_code")
        if parse(latest["expires_at"]) < now():
            raise AuthError(400, "That code has expired. Ask for a new one.", "expired")
        if latest["attempts"] >= CODE_ATTEMPTS:
            raise AuthError(429, "Too many tries for this code. Ask for a new one.", "attempts")
        if not same_digest(code_digest(code, row["id"], self.settings.auth_secret), latest["code_hash"]):
            left = CODE_ATTEMPTS - latest["attempts"] - 1
            await self.users.update_code(latest["id"], attempts=latest["attempts"] + 1)
            raise AuthError(400, f"That code doesn't match. {left} {'try' if left == 1 else 'tries'} left." if left else "That code doesn't match. Ask for a new one.", "mismatch")
        await self.users.update_code(latest["id"], consumed_at=now().isoformat())

    async def signup(self, name: str, email: str, password: str) -> None:
        existing = await self.users.by_email(email)
        if existing and existing.get("verified_at"):
            raise AuthError(409, "There's already an account with this email. Sign in instead.", "exists")
        if existing:
            # Signed up before but never verified: take the new details and send a fresh code.
            await self.users.update(existing["id"], name=name, password_hash=hash_password(password))
            row = {**existing, "name": name}
        else:
            row = await self.users.create(name, email, hash_password(password))
        await self._send_code(row, "verify")

    async def resend(self, email: str, purpose: str) -> None:
        row = await self.users.by_email(email)
        # Same answer whether or not the account exists, so this can't be used to find out who has one.
        if not row or (purpose == "verify" and row.get("verified_at")) or (purpose == "reset" and not row.get("verified_at")):
            return
        await self._send_code(row, purpose)

    async def verify(self, email: str, code: str) -> User:
        row = await self.users.by_email(email)
        if not row:
            raise AuthError(400, "That code isn't valid any more. Ask for a new one.", "no_code")
        if row.get("verified_at"):
            return self.user(row)
        await self._check_code(row, "verify", code)
        verified_at = now().isoformat()
        await self.users.update(row["id"], verified_at=verified_at)
        return self.user({**row, "verified_at": verified_at})

    async def login(self, email: str, password: str) -> User:
        row = await self.users.by_email(email)
        if not verify_password(password, row["password_hash"] if row else None) or not row:
            raise AuthError(401, "That email and password don't match.", "credentials")
        if not row.get("verified_at"):
            try:
                await self._send_code(row, "verify")
            except AuthError as exc:
                if exc.code != "cooldown":
                    raise
            raise AuthError(403, "Verify your email first. We've sent you a code.", "unverified")
        return self.user(row)

    async def forgot(self, email: str) -> None:
        if self._is_demo_email(email):
            return  # the demo accounts' passwords can't be reset
        try:
            await self.resend(email, "reset")
        except AuthError as exc:
            if exc.code != "cooldown":
                raise

    async def reset(self, email: str, code: str, password: str) -> User:
        if self._is_demo_email(email):
            raise AuthError(403, "The demo account's password can't be changed.", "demo")
        row = await self.users.by_email(email)
        if not row or not row.get("verified_at"):
            raise AuthError(400, "That code isn't valid any more. Ask for a new one.", "no_code")
        await self._check_code(row, "reset", code)
        await self.users.update(row["id"], password_hash=hash_password(password))
        await self.users.end_all_sessions(row["id"])  # a reset signs out every other device
        return self.user(row)

    async def start_session(self, user: User, ip: str, user_agent: str) -> str:
        token = new_token()
        await self.users.add_session(token_digest(token), user.id, SESSION_TTL, ip, user_agent)
        await self.users.update(user.id, last_login_at=now().isoformat())
        return token

    async def from_token(self, token: str | None) -> User | None:
        if not token:
            return None
        session = await self.users.session(token_digest(token))
        if not session:
            return None
        if parse(session["expires_at"]) < now():
            await self.users.end_session(session["id"])
            return None
        row = await self.users.by_id(session["user_id"])
        return self.user(row) if row and row.get("verified_at") else None

    async def end_session(self, token: str | None) -> None:
        if token:
            await self.users.end_session(token_digest(token))

    async def rename(self, user: User, name: str) -> User:
        self._not_demo(user)
        await self.users.update(user.id, name=name)
        return User(user.id, name, user.email, user.role, user.verified, user.created_at, user.demo)

    async def demo_user(self, kind: str) -> User:
        """The shared judge or admin demo account, for the one-click sign-in on the login page."""
        if not self.settings.demo_login:
            raise AuthError(404, "Demo sign-in is turned off on this server.", "demo_off")
        admin = kind == "admin"
        email = self.settings.demo_admin_email if admin else self.settings.demo_judge_email
        row = await self.users.by_email(email)
        if row is None:
            # First use on a fresh database (or the in-memory store after a restart): create the shared account,
            # verified, so judges never meet a dead "Demo account" button.
            row = await self.users.create("Demo Admin" if admin else "Demo Judge", email, hash_password(DEMO_PASSWORD))
        if not row.get("verified_at"):
            await self.users.update(row["id"], verified_at=now().isoformat())
            row = await self.users.by_email(email) or row
        return self.user(row)

    async def delete_account(self, user: User) -> None:
        """Deletes the account and everything tied to it: sessions, codes, investigations, feedback and messages."""
        self._not_demo(user)
        await self.runs.delete_for_user(user.id)
        await self.feedback.delete_for_user(user.id)
        await self.users.delete(user.id)
