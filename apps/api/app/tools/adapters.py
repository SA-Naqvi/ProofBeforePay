"""The lookups a lead can run: corporate registries, customs and trade logs, certificate directories, domain records,
address surveys and reverse-image search.

Every tool returns pages (text that becomes a numbered source) and, for the tools that measure something rather than
read something, deterministic facts. A tool that cannot run (no key, service down) says so; the investigation then
records the lead as "not checked", which is never treated as evidence either way.
"""
from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import httpx

from . import domain_inspector
from .tavily_search import domain_of

if TYPE_CHECKING:
    from ..agent.state import Run
    from ..core.config import Settings
    from .tavily_search import WebResearch

logger = logging.getLogger("proofbeforepay.tools")

REGISTRY_DOMAINS = [
    "opencorporates.com", "find-and-update.company-information.service.gov.uk", "zaubacorp.com", "tofler.in",
    "thecompanycheck.com", "qcc.com", "aiqicha.baidu.com", "tianyancha.com", "gsxt.gov.cn", "icris.cr.gov.hk",
    "bizfile.gov.sg", "dnb.com", "kompass.com", "northdata.com", "opengovsg.com", "ebr.gov.in",
]
TRADE_DOMAINS = ["importyeti.com", "panjiva.com", "volza.com", "tradeatlas.com", "zauba.com", "seair.co.in", "eximpedia.app"]
CERT_DOMAINS = ["iafcertsearch.org", "iso.org", "certipedia.com", "bsigroup.com", "tuvsud.com", "sgs.com"]
# Marketplaces and stock-photo hosts: a photo found there says nothing about who took it.
MARKETPLACES = {
    "alibaba.com", "indiamart.com", "made-in-china.com", "aliexpress.com", "1688.com", "tradeindia.com", "globalsources.com",
    "dhgate.com", "ec21.com", "exportersindia.com", "pinterest.com", "facebook.com", "instagram.com", "youtube.com",
    "shutterstock.com", "alamy.com", "gettyimages.com", "istockphoto.com", "unsplash.com", "pexels.com", "alicdn.com",
}
_UA = {"User-Agent": "ProofBeforePay/1.0 (supplier due-diligence research)"}


@dataclass
class ToolOutput:
    pages: list[dict[str, Any]] = field(default_factory=list)  # url, title, content, observe, facts
    note: str = ""
    available: bool = True


def _page(url: str, title: str, content: str, *, observe: bool = True, facts: list[dict[str, str]] | None = None) -> dict[str, Any]:
    return {"url": url, "title": title, "content": content, "observe": observe, "facts": facts or []}


def _from_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_page(r["url"], r.get("title", ""), r.get("raw_content") or r.get("content", "")) for r in results]


class ToolBox:
    def __init__(self, web: WebResearch, settings: Settings | None = None) -> None:
        self.web = web
        self.settings = settings
        self._osm_gate = asyncio.Semaphore(1)  # Nominatim's usage policy: one request at a time

    async def run(self, run: Run, lead: dict[str, Any]) -> ToolOutput:
        handler = getattr(self, f"_{lead['tool']}", None)
        if handler is None:
            return ToolOutput(note=f"No tool named {lead['tool']}", available=False)
        try:
            return await handler(run, lead["id"], lead["target"])
        except Exception as exc:  # one failing source must not sink the investigation
            logger.warning("Tool %s failed for lead %s: %s", lead["tool"], lead["id"], exc)
            return ToolOutput(note=f"The {lead['tool']} lookup failed ({type(exc).__name__}).", available=False)

    # ── registries ───────────────────────────────────────────────────────────
    async def _registry(self, run: Run, lead_id: str, target: dict[str, str]) -> ToolOutput:
        name, reg_no, country = target.get("name", ""), target.get("reg_no", ""), target.get("country", "")
        step = f"investigate:{lead_id}"
        pages: list[dict[str, Any]] = []
        key = self.settings.opencorporates_api_key if self.settings else ""
        if key and (name or reg_no):
            pages += await self._opencorporates(name or reg_no, key)
        queries = []
        if reg_no:
            queries.append(f'"{reg_no}" {name} company registration'.strip())
        if name:
            queries.append(f'"{name}" company registry {country}'.strip())
        batches = await asyncio.gather(
            *(self.web.search(run, q, step=step, purpose="registry", include_domains=REGISTRY_DOMAINS, max_results=4) for q in queries[:2])
        )
        results = [r for batch in batches for r in batch]
        if not results and name:
            results = await self.web.search(run, f'"{name}" company registration number address director', step=step, purpose="registry", max_results=4)
        pages += _from_results(results)
        if results:
            full, _ = await self.web.extract(run, [results[0]["url"]], step=step, purpose="registry")
            pages += _from_results(full)
        return ToolOutput(pages=pages, note="" if pages else "No registry record found.")

    async def _opencorporates(self, query: str, key: str) -> list[dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=12.0, headers=_UA) as client:
                response = await client.get(
                    "https://api.opencorporates.com/v0.4/companies/search", params={"q": query, "api_token": key, "per_page": 5}
                )
            if response.status_code != 200:
                return []
            companies = [c["company"] for c in response.json().get("results", {}).get("companies", [])]
        except (httpx.HTTPError, ValueError, KeyError):
            return []
        return [
            _page(
                c.get("opencorporates_url", "https://opencorporates.com"),
                f"{c.get('name')} ({c.get('jurisdiction_code')})",
                f"Company name: {c.get('name')}. Company number: {c.get('company_number')}. Jurisdiction: {c.get('jurisdiction_code')}. "
                f"Incorporation date: {c.get('incorporation_date')}. Status: {c.get('current_status')}. "
                f"Registered address: {c.get('registered_address_in_full')}.",
            )
            for c in companies
        ]

    # ── customs and trade logs ───────────────────────────────────────────────
    async def _trade(self, run: Run, lead_id: str, target: dict[str, str]) -> ToolOutput:
        name = target.get("name", "")
        step = f"investigate:{lead_id}"
        results = await self.web.search(
            run, f'"{name}" shipments exporter supplier bill of lading', step=step, purpose="trade", include_domains=TRADE_DOMAINS, max_results=4
        )
        pages = _from_results(results)
        if results:
            full, _ = await self.web.extract(run, [results[0]["url"]], step=step, purpose="trade")
            pages += _from_results(full)
        return ToolOutput(pages=pages, note="" if pages else f"No customs or trade records found for {name}.")

    # ── certificates ─────────────────────────────────────────────────────────
    async def _certificate(self, run: Run, lead_id: str, target: dict[str, str]) -> ToolOutput:
        number, holder = target.get("number", ""), target.get("holder", "")
        standard, issuer = target.get("standard", ""), target.get("issuer", "")
        step = f"investigate:{lead_id}"
        queries = [f'"{number}" {standard} certificate {issuer}'.strip()] if number else []
        if holder:
            queries.append(f'"{holder}" {standard} certificate {issuer}'.strip())
        batches = await asyncio.gather(
            *(self.web.search(run, q, step=step, purpose="certificate", include_domains=CERT_DOMAINS, max_results=4) for q in queries[:2])
        )
        results = [r for batch in batches for r in batch]
        if not results and queries:
            results = await self.web.search(run, queries[0], step=step, purpose="certificate", max_results=4)
        return ToolOutput(pages=_from_results(results), note="" if results else "The certificate was not found in any public directory.")

    # ── web ──────────────────────────────────────────────────────────────────
    async def _web(self, run: Run, lead_id: str, target: dict[str, str]) -> ToolOutput:
        results = await self.web.search(
            run, target["query"], step=f"investigate:{lead_id}", purpose="web", depth="basic", max_results=5, exact_match=target.get("exact") == "1"
        )
        return ToolOutput(pages=_from_results(results), note="" if results else "The search returned nothing.")

    # ── domain records ───────────────────────────────────────────────────────
    async def _domain(self, run: Run, lead_id: str, target: dict[str, str]) -> ToolOutput:
        domain = target["domain"].strip().lower()
        # The target can come from a model that has read untrusted pages, and it ends up in a URL path: hostnames only.
        if not re.fullmatch(r"(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+", domain):
            return ToolOutput(note=f"'{domain[:60]}' is not a valid domain name.", available=False)
        (info,) = await domain_inspector.lookup_domain_ages([domain])
        if info.get("missing"):
            text, facts = f"The registry has no record of {domain}.", [{"field": "domain_age_days", "value": "missing", "quote": f"no record of {domain}"}]
        elif info.get("age_days") is None:
            return ToolOutput(note=f"The registry published no registration date for {domain}.")
        else:
            text = f"{domain} was registered {info['registered'][:10]} ({info['age_days']} days ago)."
            facts = [{"field": "domain_age_days", "value": str(info["age_days"]), "quote": text}]
        return ToolOutput(pages=[_page(f"https://rdap.org/domain/{domain}", f"RDAP record for {domain}", text, observe=False, facts=facts)])

    # ── addresses ────────────────────────────────────────────────────────────
    async def _address(self, run: Run, lead_id: str, target: dict[str, str]) -> ToolOutput:
        address = target["address"]
        pages: list[dict[str, Any]] = []
        survey = await self._survey(address)
        if survey:
            pages.append(survey)
        results = await self.web.search(
            run, f'"{address}" virtual office OR coworking OR residential OR factory', step=f"investigate:{lead_id}", purpose="address", depth="basic", max_results=3
        )
        pages += _from_results(results)
        return ToolOutput(pages=pages, note="" if pages else "The address could not be located.")

    async def _survey(self, address: str) -> dict[str, Any] | None:
        """What the map says is at this address: geocode it, then count nearby land use and building types."""
        async with self._osm_gate:
            try:
                async with httpx.AsyncClient(timeout=15.0, headers=_UA) as client:
                    geo = await client.get(
                        "https://nominatim.openstreetmap.org/search", params={"q": address, "format": "jsonv2", "limit": 1}
                    )
                    hits = geo.json() if geo.status_code == 200 else []
                    if not hits:
                        return None
                    lat, lon, label = hits[0]["lat"], hits[0]["lon"], hits[0].get("display_name", address)
                    query = f'[out:json][timeout:15];(way(around:250,{lat},{lon})["landuse"];way(around:60,{lat},{lon})["building"];);out tags 60;'
                    over = await client.post("https://overpass-api.de/api/interpreter", data={"data": query})
                    elements = over.json().get("elements", []) if over.status_code == 200 else []
            except (httpx.HTTPError, ValueError, KeyError):
                return None
        zone, summary = classify_zone(elements)
        content = (
            f"OpenStreetMap places '{address}' at {label} ({lat}, {lon}). Land use within 250 m and buildings within 60 m: {summary}. "
            f"Zone: {zone}."
        )
        facts = [{"field": "address_zone", "value": zone, "quote": f"Zone: {zone}."}]
        return _page(f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=18/{lat}/{lon}", f"Map survey of {address}", content, observe=False, facts=facts)

    # ── photos ───────────────────────────────────────────────────────────────
    async def _image(self, run: Run, lead_id: str, target: dict[str, str]) -> ToolOutput:
        key = self.settings.google_vision_api_key if self.settings else ""
        if not key:
            return ToolOutput(note="Reverse-image search isn't configured (GOOGLE_VISION_API_KEY), so this photo was not checked.", available=False)
        url, own = target["url"], {d for d in target.get("own_domains", "").split(",") if d}
        body = {"requests": [{"image": {"source": {"imageUri": url}}, "features": [{"type": "WEB_DETECTION", "maxResults": 12}]}]}
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post("https://vision.googleapis.com/v1/images:annotate", params={"key": key}, json=body)
        if response.status_code != 200:
            return ToolOutput(note=f"Reverse-image search failed (HTTP {response.status_code}).", available=False)
        detection = (response.json().get("responses") or [{}])[0].get("webDetection", {})
        matches = detection.get("pagesWithMatchingImages", [])
        pages, seen = [], set()
        for match in matches:
            domain = domain_inspector.registrable(domain_of(match["url"]))
            if domain in seen or domain in own:
                continue
            seen.add(domain)
            title = match.get("pageTitle", "") or domain
            content = f"The photo {url} also appears on {match['url']} ({title})."
            facts = [] if domain in MARKETPLACES else [{"field": "image_match_domain", "value": domain, "quote": content}]
            pages.append(_page(match["url"], f"Same photo on {domain}", content, observe=False, facts=facts))
        note = "" if pages else "No other web page was found using this photo."
        return ToolOutput(pages=pages[:6], note=note)


def classify_zone(elements: list[dict[str, Any]]) -> tuple[str, str]:
    """Industrial, commercial or residential, from the OpenStreetMap tags around a point."""
    land: dict[str, int] = {}
    building: dict[str, int] = {}
    for element in elements:
        tags = element.get("tags", {})
        if "landuse" in tags:
            land[tags["landuse"]] = land.get(tags["landuse"], 0) + 1
        if "building" in tags:
            building[tags["building"]] = building.get(tags["building"], 0) + 1
    industrial = land.get("industrial", 0) + sum(building.get(b, 0) for b in ("industrial", "warehouse", "factory", "manufacture"))
    residential = land.get("residential", 0) + sum(building.get(b, 0) for b in ("apartments", "residential", "house", "detached", "dormitory", "terrace"))
    commercial = land.get("commercial", 0) + land.get("retail", 0) + sum(building.get(b, 0) for b in ("commercial", "office", "retail"))
    parts = [f"{n} {k}" for k, n in {**{f'landuse {k}': v for k, v in land.items()}, **{f'building {k}': v for k, v in building.items()}}.items()]
    summary = ", ".join(parts[:8]) or "no tagged land use or buildings"
    if industrial and industrial >= residential:
        return "industrial", summary
    if residential and residential > industrial + commercial:
        return "residential", summary
    if commercial:
        return "commercial", summary
    return "unknown", summary

