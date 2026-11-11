"""Step 1: read the paperwork. Nemotron Nano extracts what the supplier says about itself; code turns that into
checkable claims and the first leads, and flags payment-term patterns."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from ..agent.reconcile import Reconciler
from ..agent.workflow import PipelineError, _log, _text, stage
from ..llm import prompts
from ..tools.adapters import MARKETPLACES
from ..tools.domain_inspector import FREE_EMAIL, PLATFORMS, SHORTENERS
from ..tools.url_inspector import extract_contacts

if TYPE_CHECKING:
    from ..agent.state import Investigation


class ClaimExtractor:
    """Turns the pasted paperwork, listing and form fields into a supplier profile, claims and opening leads."""

    async def _intake(self, inv: Investigation) -> None:
        run, offer = inv.run, inv.offer
        async with stage(run, "intake"):
            listing = await self._read_listing(inv)
            text = "\n\n".join(x for x in (offer.get("message", "").strip(), listing["text"]) if x)
            inv.offer = offer = {**offer, "message": text} if text else offer
            inv.contacts = extract_contacts(text, offer.get("sender", ""))
            _log(run, "intake", "Scanning the paperwork for risky payment terms and pressure")
            inv.signals.scan_patterns(text)
            _log(run, "intake", "Nemotron Nano is extracting what the supplier claims")
            data = await self.llm.complete_json(run, tier="nano", step="intake", messages=prompts.intake_messages(offer), max_tokens=1500)
            if not isinstance(data, dict):
                raise PipelineError("Couldn't read the paperwork. Try pasting the complete invoice or listing.")
            inv.profile = self._profile(inv, data, listing["images"])
            if not (inv.profile["supplier_name"] or inv.profile["registration_no"]):
                raise PipelineError("The paperwork doesn't name the supplier or give a registration number. Add the company name and try again.")
            self._build_claims(inv)
            Reconciler(inv).check_payment()
            self._open_leads(inv)
            run.emit("entities", entities=inv.profile, claims=inv.claims)
            _log(run, "intake", f"{len(inv.claims)} claims to check, {len(inv.case.leads)} first lookups queued")

    async def _read_listing(self, inv: Investigation) -> dict[str, Any]:
        """A marketplace listing link is read through Tavily, never opened by this server."""
        url = (inv.offer.get("listing_url") or "").strip()
        if not url:
            return {"text": "", "images": []}
        _log(inv.run, "intake", "Reading the supplier's listing page with Tavily Extract")
        pages, _ = await self.web.extract(inv.run, [url], step="intake:listing", purpose="listing", images=True)
        if not pages:
            _log(inv.run, "intake", "The listing page couldn't be opened; continuing with what you pasted", "warn")
            return {"text": "", "images": []}
        page = pages[0]
        source = inv.sources.add(page["url"], page.get("title") or "", page["raw_content"], purpose="listing")
        images = [i for i in page.get("images", []) if isinstance(i, str)][:6]
        return {"text": f"LISTING PAGE ({source['url']}):\n{source['content'][:4000]}", "images": images}

    def _profile(self, inv: Investigation, data: dict[str, Any], listing_images: list[str]) -> dict[str, Any]:
        offer = inv.offer
        payment = data.get("payment") if isinstance(data.get("payment"), dict) else {}
        certificates = []
        for item in data.get("certificates") if isinstance(data.get("certificates"), list) else []:
            if isinstance(item, dict) and (_text(item.get("number"), 80) or _text(item.get("standard"), 80)):
                certificates.append({k: _text(item.get(k), 120) for k in ("standard", "number", "issuer", "holder")})
        if _text(offer.get("certificate_no"), 80) and not any(c["number"] == offer["certificate_no"] for c in certificates):
            certificates.insert(0, {"standard": "", "number": offer["certificate_no"].strip(), "issuer": "", "holder": ""})
        claimed_type = _text(data.get("claimed_type"), 20).lower()
        own_domains = [
            d for d in inv.contacts["domains"] if d not in FREE_EMAIL | PLATFORMS | SHORTENERS | MARKETPLACES
        ][:3]
        images = list(dict.fromkeys([*(offer.get("image_urls") or []), *listing_images]))[:3]
        return {
            # What the buyer typed in the form wins over what the model read out of the paperwork.
            "supplier_name": _text(offer.get("company"), 160) or _text(data.get("supplier_name"), 160),
            "claimed_type": claimed_type if claimed_type in ("manufacturer", "trader") else "unknown",
            "country": _text(data.get("country"), 60),
            "address": _text(offer.get("address"), 300) or _text(data.get("address"), 300),
            "registration_no": _text(offer.get("registration_no"), 80) or _text(data.get("registration_no"), 80),
            "products": _text(data.get("products"), 200),
            "platform": _text(data.get("platform"), 60) or _text(offer.get("channel"), 60),
            "certificates": certificates[:4],
            "deposit": _text(offer.get("deposit"), 120) or _text(data.get("deposit"), 120),
            "payment": {k: _text(payment.get(k), 160) for k in ("beneficiary", "bank", "method")},
            "requests": [r for r in (_text(x, 200) for x in data.get("requests") or []) if r][:6],
            "domains": own_domains,
            "emails": inv.contacts["emails"],
            "image_urls": images,
            "listing_url": _text(offer.get("listing_url"), 300),
            "contacts": inv.contacts,
        }

    def _build_claims(self, inv: Investigation) -> None:
        p, name = inv.profile, inv.profile["supplier_name"] or "The supplier"

        def add(claim_type: str, text: str, key: str | None = None) -> None:
            inv.claims.append({
                "id": f"C{len(inv.claims) + 1}", "type": claim_type, "text": text, "key": key, "status": "inconclusive",
                "confidence": 0.0, "note": "Not checked yet.", "source_id": None, "quote": "", "source": None,
                "checked_by": "code", "escalated": False, "signal_ids": [],
            })

        add("identity", f"{name} is a legally registered company")
        if p["registration_no"]:
            add("registration", f"Registration number {p['registration_no']} belongs to {name}")
        if p["address"]:
            add("address", f"{name} operates from {p['address']}")
        if p["claimed_type"] == "manufacturer":
            add("capability", f"{name} is a manufacturer with its own factory")
        for cert in p["certificates"]:
            label = " ".join(x for x in (cert["standard"], cert["number"]) if x)
            add("certification", f"{name} holds {label}", key=f"cert:{cert['standard']}:{cert['number']}")
        if p["image_urls"]:
            add("imagery", f"The photos in the listing show {name}'s own facility")
        if (p["payment"] or {}).get("beneficiary"):
            add("payment", f"The payment account is held by {name}")
        for claim in inv.claims:
            inv.run.emit("claim", claim=claim)

    def _open_leads(self, inv: Investigation) -> None:
        p, case, name = inv.profile, inv.case, inv.profile["supplier_name"]
        if name or p["registration_no"]:
            case.add("registry", {"name": name, "reg_no": p["registration_no"], "country": p["country"]}, "Check the company and its registration number against corporate registries", priority=1)
        if name:
            case.add("trade", {"name": name}, "Look for customs and shipping records under this name", priority=2)
        if p["address"]:
            case.add("address", {"address": p["address"]}, "Survey the address: industrial zone, office or apartment block", priority=2)
        for cert in p["certificates"]:
            case.add("certificate", cert | {"holder": cert["holder"] or name}, f"Verify {cert['standard'] or 'the certificate'} {cert['number']} in public directories", priority=3)
        for url in p["image_urls"]:
            case.add("image", {"url": url, "own_domains": ",".join(p["domains"])}, "Find out whether this factory photo appears elsewhere on the web", priority=3)
        for domain in p["domains"][:2]:
            case.add("domain", {"domain": domain}, f"Read the registration record of {domain}", priority=2)
        if name:
            case.add("web", {"query": f'"{name}" scam OR complaint OR fraud OR "not delivered"'}, "Look for public complaints about this supplier", priority=4)
        inv.searched.extend(f"{lead['tool']}: {lead['target']}" for lead in case.leads)
