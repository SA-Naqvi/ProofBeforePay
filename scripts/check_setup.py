"""Verify the Token Factory, Tavily and (optional) Supabase settings and resolve the Nemotron model IDs.

Run from the repository root with the API's virtualenv:  apps/api/.venv/bin/python scripts/check_setup.py
"""
from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from openai import APIError  # noqa: E402
from tavily import AsyncTavilyClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.supabase import SupabaseDatabase  # noqa: E402
from app.llm.nebius_client import LLMRouter  # noqa: E402
from app.repositories.investigation_repo import InvestigationRepo  # noqa: E402


async def check_models() -> bool:
    if not settings.nebius_api_key:
        print("[FAIL] NEBIUS_API_KEY is not set in .env")
        return False
    router = LLMRouter(settings)
    try:
        page = await router.client.models.list()
    except APIError as exc:
        print(f"[FAIL] Token Factory rejected the key or base URL ({settings.nebius_base_url}): {exc}")
        return False
    nemotron = sorted(m.id for m in page.data if "nemotron" in m.id.lower())
    print(f"[ OK ] Token Factory reachable. {len(page.data)} models, {len(nemotron)} Nemotron:")
    for model_id in nemotron:
        print(f"         - {model_id}")

    configured = {name: tier.model for name, tier in router.tiers.items()}
    await router.resolve_models()
    ok = True
    for name, tier in router.tiers.items():
        started = time.monotonic()
        messages = [{"role": "user", "content": "Reply with exactly one word: ready"}]
        mode = "thinking off"
        try:
            try:
                response = await router.client.chat.completions.create(
                    model=tier.model, messages=messages, max_tokens=400,
                    extra_body={"chat_template_kwargs": {"enable_thinking": False}},
                )
            except APIError:
                mode = "plain"
                response = await router.client.chat.completions.create(model=tier.model, messages=messages, max_tokens=2000)
        except APIError as exc:
            print(f"[FAIL] {name:5} {tier.model}: {exc}")
            ok = False
            continue
        answer = (response.choices[0].message.content or "").strip().replace("\n", " ")[:60]
        moved = "" if configured[name] == tier.model else f"  (configured {configured[name]} was not found)"
        print(f"[ OK ] {name:5} {tier.model} -> {answer!r} in {round((time.monotonic() - started) * 1000)} ms [{mode}]{moved}")
    if any(configured[n] != t.model for n, t in router.tiers.items()):
        print("\nAdd these lines to .env to pin the resolved models:")
        for name, tier in router.tiers.items():
            print(f"MODEL_{name.upper()}={tier.model}")
    return ok


async def check_tavily() -> bool:
    if not settings.tavily_api_key:
        print("[FAIL] TAVILY_API_KEY is not set in .env")
        return False
    try:
        response = await AsyncTavilyClient(api_key=settings.tavily_api_key).search(
            "Nebius Token Factory Nemotron", max_results=1, include_usage=True
        )
    except Exception as exc:
        print(f"[FAIL] Tavily: {exc}")
        return False
    print(f"[ OK ] Tavily search works ({len(response.get('results', []))} result, usage {response.get('usage')})")
    return True


async def check_database() -> bool:
    if not settings.db_configured:
        print("[skip] Supabase isn't configured; runs are saved as JSON in backend/data/runs")
        return True
    db = SupabaseDatabase(settings.supabase_url, settings.supabase_secret_key)
    try:
        accounts = await db.ping()
        spent = await InvestigationRepo(db).spent()
    finally:
        await db.close()
    if spent is None or not accounts:
        print("[FAIL] Supabase: the tables aren't there yet. Run apps/api/migrations/0001_init.sql and then "
              "0002_accounts.sql and 0003_credits.sql in the Supabase SQL Editor, and check SUPABASE_URL and SUPABASE_SECRET_KEY.")
        return False
    print(f"[ OK ] Supabase connected; accounts ready; model spend recorded so far ${spent:.4f}")
    return True


def check_email() -> bool:
    if not settings.resend_api_key:
        state = "codes are printed in the server log (local only)" if not settings.production else "sign-up can't send codes"
        print(f"[skip] RESEND_API_KEY isn't set; {state}")
        return not settings.production
    print(f"[ OK ] Resend configured; emails come from {settings.email_from}")
    if not settings.admin_emails:
        print("[note] ADMIN_EMAILS is empty, so nobody can open the admin dashboard")
    return True


async def check_paypal() -> bool:
    if not settings.payments_enabled:
        print("[skip] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET aren't set; credits are off and checks are free")
        return True
    from app.services.paypal_gateway import PayPalGateway, PaymentError

    pack = settings.credit_packs[0]
    try:
        # Creating an order (never approved or captured) proves the credentials work without taking any money.
        order = await PayPalGateway(settings).create_order(
            pack, reference="check-setup", return_url=f"{settings.public_url}/billing?paid=1", cancel_url=f"{settings.public_url}/billing?cancelled=1"
        )
    except PaymentError as exc:
        print(f"[FAIL] PayPal ({settings.paypal_env}) rejected the credentials or the request: {exc}")
        return False
    where = "SANDBOX: no real money moves" if settings.paypal_env == "sandbox" else "LIVE: real money"
    print(f"[ OK ] PayPal {settings.paypal_env} works (order {order['id']} created, not charged). {where}")
    return True


async def main() -> int:
    results = [await check_models(), await check_tavily(), await check_database(), check_email(), await check_paypal()]
    print("\nAll good. Start the server with: uvicorn app.main:app --reload" if all(results) else "\nFix the items marked FAIL.")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
