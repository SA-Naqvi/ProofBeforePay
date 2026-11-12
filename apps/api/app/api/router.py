"""Every API route, under /api/v1."""
from __future__ import annotations

from fastapi import APIRouter

from .v1 import admin, assist, auth, billing, contact, deposits, evidence, feedback, health, investigations, me, reports

api_router = APIRouter(prefix="/api/v1")
for module in (health, investigations, evidence, reports, assist, auth, me, billing, deposits, feedback, contact, admin):
    api_router.include_router(module.router)
