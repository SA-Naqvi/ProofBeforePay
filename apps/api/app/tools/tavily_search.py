"""Tavily web research (search, exact-phrase search, crawl, extract) with per-call telemetry and a source registry."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit, urlunsplit

from tavily import AsyncTavilyClient

if TYPE_CHECKING:
    from ..agent.state import Run

logger = logging.getLogger("proofbeforepay.search")

_SEARCH_CREDITS = {"basic": 1, "advanced": 2}


def normalize_url(url: str) -> str:
    parts = urlsplit(url.strip())
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower().removeprefix("www."), path, parts.query, ""))


def domain_of(url: str) -> str:
    return urlsplit(url if "//" in url else f"https://{url}").netloc.lower().removeprefix("www.")


def _credits(response: dict[str, Any], fallback: int) -> float:
    usage = response.get("usage") or {}
    value = usage.get("credits")
    return float(value) if isinstance(value, (int, float)) else float(fallback)


class WebResearch:
    def __init__(self, api_key: str, concurrency: int = 6) -> None:
        self.client = AsyncTavilyClient(api_key=api_key) if api_key else None
        self._gate = asyncio.Semaphore(concurrency)

    async def search(
        self,
        run: Run,
        query: str,
        *,
        step: str,
        purpose: str,
        depth: str = "advanced",
        max_results: int = 5,
        include_domains: list[str] | None = None,
        exact_match: bool = False,
    ) -> list[dict[str, Any]]:
        """One Tavily search. Failures are logged to the run and yield no results, never an exception."""
        if self.client is None:
            return []
        started = time.monotonic()
        results: list[dict[str, Any]] = []
        credits = 0.0
        ok = True
        params: dict[str, Any] = {
            "query": query[:400],
            "search_depth": depth,
            "max_results": max_results,
            "include_answer": False,
            "include_raw_content": False,
            "include_usage": True,
        }
        if include_domains:
            params["include_domains"] = include_domains
        if exact_match:
            params["exact_match"] = True
        async with self._gate:
            try:
                response = await self.client.search(**params)
                results = [r for r in response.get("results", []) if r.get("url") and r.get("content")]
                credits = _credits(response, _SEARCH_CREDITS.get(depth, 1))
            except Exception as exc:  # Tavily raises several unrelated types; one bad query must not sink the run.
                ok = False
                logger.warning("Tavily search failed for %r: %s", query, exc)
                run.emit("log", stage=step.split(":")[0], level="warn", message=f"Search failed: {query[:80]}")
        run.emit(
            "tavily_call",
            call={
                "kind": "exact" if exact_match else "search",
                "step": step,
                "purpose": purpose,
                "query": query[:400],
                "depth": depth,
                "domains": include_domains or [],
                "results": len(results),
                "latency_ms": round((time.monotonic() - started) * 1000),
                "credits": credits,
                "ok": ok,
            },
        )
        return results

    async def crawl(self, run: Run, url: str, instructions: str, *, step: str, purpose: str) -> list[dict[str, Any]]:
        """Crawl a site with natural-language instructions (used to read an official careers section)."""
        if self.client is None:
            return []
        started = time.monotonic()
        results: list[dict[str, Any]] = []
        credits = 0.0
        ok = True
        async with self._gate:
            try:
                response = await self.client.crawl(
                    url=url,
                    instructions=instructions,
                    max_depth=2,
                    max_breadth=20,
                    limit=15,
                    extract_depth="basic",
                    include_usage=True,
                    timeout=60,
                )
                results = [r for r in response.get("results", []) if r.get("url") and r.get("raw_content")]
                credits = _credits(response, 2)
            except Exception as exc:
                ok = False
                logger.warning("Tavily crawl failed for %s: %s", url, exc)
                run.emit("log", stage=step.split(":")[0], level="warn", message=f"Crawl failed: {domain_of(url)}")
        run.emit(
            "tavily_call",
            call={
                "kind": "crawl",
                "step": step,
                "purpose": purpose,
                "query": instructions,
                "url": url,
                "depth": "basic",
                "results": len(results),
                "latency_ms": round((time.monotonic() - started) * 1000),
                "credits": credits,
                "ok": ok,
            },
        )
        return results

    async def extract(
        self, run: Run, urls: list[str], *, step: str, purpose: str, images: bool = False
    ) -> tuple[list[dict[str, Any]], list[str]]:
        """Read pages through Tavily, so links from an untrusted message are never fetched by this server.

        Returns (pages that could be read, urls that could not).
        """
        if not urls:
            return [], []
        if self.client is None:
            return [], list(urls)
        started = time.monotonic()
        results: list[dict[str, Any]] = []
        failed: list[str] = []
        credits = 0.0
        ok = True
        async with self._gate:
            try:
                response = await self.client.extract(
                    urls=urls, extract_depth="basic", format="text", include_usage=True, include_images=images, timeout=30
                )
                results = [r for r in response.get("results", []) if r.get("url") and r.get("raw_content")]
                failed = [str(f.get("url", "")) for f in response.get("failed_results", []) if isinstance(f, dict)]
                credits = _credits(response, 1)
            except Exception as exc:
                ok = False
                failed = list(urls)
                logger.warning("Tavily extract failed for %s: %s", urls, exc)
                run.emit("log", stage=step.split(":")[0], level="warn", message="Couldn't open the linked pages")
        run.emit(
            "tavily_call",
            call={
                "kind": "extract",
                "step": step,
                "purpose": purpose,
                "query": ", ".join(urls)[:400],
                "depth": "basic",
                "results": len(results),
                "latency_ms": round((time.monotonic() - started) * 1000),
                "credits": credits,
                "ok": ok,
            },
        )
        return results, failed


class SourceRegistry:
    """Deduplicates every page the agents read and gives it a stable citation id (S1, S2, …)."""

    def __init__(self, run: Run) -> None:
        self.run = run
        self.items: list[dict[str, Any]] = []
        self._by_url: dict[str, dict[str, Any]] = {}
        self._by_id: dict[str, dict[str, Any]] = {}

    def add(self, url: str, title: str, content: str, *, purpose: str) -> dict[str, Any]:
        content = content[:8000]
        key = normalize_url(url)
        existing = self._by_url.get(key)
        if existing:
            if len(content) > len(existing["content"]):
                existing["content"] = content.strip()
            if purpose not in existing["purposes"]:
                existing["purposes"].append(purpose)
            return existing
        source = {
            "id": f"S{len(self.items) + 1}",
            "url": url,
            "title": (title or domain_of(url)).strip()[:200],
            "domain": domain_of(url),
            "purposes": [purpose],
            "content": content.strip(),
            "retrieved_at": time.time(),  # web pages change; keep when we read this one
        }
        self.items.append(source)
        self._by_url[key] = source
        self._by_id[source["id"]] = source
        self.run.emit("source", source=self.public(source))
        return source

    def add_results(self, results: list[dict[str, Any]], *, purpose: str) -> list[dict[str, Any]]:
        return [
            self.add(r["url"], r.get("title", ""), r.get("raw_content") or r.get("content", ""), purpose=purpose)
            for r in results
        ]

    def get(self, source_id: str | None) -> dict[str, Any] | None:
        if not source_id:
            return None
        return self._by_id.get(str(source_id).strip().strip("[]").upper())

    def with_purpose(self, *purposes: str) -> list[dict[str, Any]]:
        return [s for s in self.items if any(p in s["purposes"] for p in purposes)]

    @staticmethod
    def public(source: dict[str, Any]) -> dict[str, Any]:
        snippet = " ".join(source["content"].split())[:280]
        return {k: source[k] for k in ("id", "url", "title", "domain", "purposes", "retrieved_at")} | {"snippet": snippet}
