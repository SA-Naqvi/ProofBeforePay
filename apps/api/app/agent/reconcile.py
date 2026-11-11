"""Reconciliation: compare what the supplier claims with what each independent source says.

This is where inconsistencies are found and where follow-up leads come from. It is plain code, not a model: a model
reads the pages and reports what they state (intelligence/investigator.py); this module decides whether two names,
numbers or addresses agree, what that means for each claim, and which lookup should come next.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from ..risk.matching import addresses_match, names_match, normalize_reg, quote_in, reg_match
from .workflow import _log

if TYPE_CHECKING:
    from .state import Investigation

_DATE_FORMATS = ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%d %B %Y", "%B %d, %Y", "%d %b %Y", "%b %d, %Y")
_MAKES = re.compile(r"\b(?:manufactur\w*|produc(?:e|tion|ing)\w*|fabricat\w*|processing|assembl\w*|machining|mould\w*|mold\w*)\b", re.I)
_TRADES = re.compile(r"\b(?:trading|trader|wholesale|retail|import\W*export|export\W*import|sales|agency|agent|distribut\w*|sourcing|consult\w*)\b", re.I)
_COMPANY_WORDS = re.compile(r"\b(?:co|ltd|limited|llc|inc|corp|corporation|pvt|pte|gmbh|company|trading|enterprise|industr\w+)\b", re.I)


def parse_date(text: str) -> date | None:
    text = text.strip()
    iso = re.search(r"\d{4}-\d{2}-\d{2}", text)
    if iso:
        text = iso.group(0)
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    year = re.search(r"\b(19|20)\d{2}\b", text)
    return date(int(year.group(0)), 6, 30) if year else None


def _entities(assertions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group a lead's assertions by the source they came from: one record per page, with the quote for each field."""
    grouped: dict[str, dict[str, Any]] = {}
    for a in assertions:
        record = grouped.setdefault(a["source_id"], {"source_id": a["source_id"], "quotes": {}})
        record.setdefault(a["field"], a["value"])
        record["quotes"].setdefault(a["field"], a["quote"])
    return list(grouped.values())


class Reconciler:
    def __init__(self, inv: Investigation) -> None:
        self.inv = inv
        self.profile = inv.profile

    # ── shared helpers ───────────────────────────────────────────────────────
    @property
    def name(self) -> str:
        return self.profile.get("supplier_name") or ""

    def _finding(
        self, lead: dict[str, Any], kind: str, polarity: str, severity: str, title: str, detail: str, *,
        rule: str = "", evidence: str = "", why: str = "", sources: list[str] | None = None,
    ) -> dict[str, Any]:
        signal = self.inv.signals.add(
            kind, polarity, severity, title, detail, evidence=evidence, why=why, rule=rule, lead=lead["id"], sources=sources or []
        )
        lead["finding_ids"].append(signal["id"])
        return signal

    def _follow(
        self, lead: dict[str, Any], signal: dict[str, Any], tool: str, target: dict[str, str], why: str, priority: int = 2
    ) -> None:
        new = self.inv.case.add(tool, target, why, parent_lead=lead["id"], parent_finding=signal["id"], priority=priority)
        if new:
            signal["spawned"].append(new["id"])
            _log(self.inv.run, "investigate", f"{signal['id']} opened {new['id']}: {why}")

    def _identity(self, name: str, role: str, source_id: str | None) -> None:
        entry = self.inv.identities.setdefault(name, {"name": name, "roles": [], "sources": []})
        if role not in entry["roles"]:
            entry["roles"].append(role)
        if source_id and source_id not in entry["sources"]:
            entry["sources"].append(source_id)

    def set_claim(
        self, claim_type: str, status: str, note: str, *, key: str | None = None, signal: dict[str, Any] | None = None,
        source_id: str | None = None, quote: str = "",
    ) -> None:
        """Move a claim's status. A contradiction is never overwritten by a later confirmation from a weaker source."""
        for claim in self.inv.claims:
            if claim["type"] != claim_type or (key and claim.get("key") != key):
                continue
            if claim["status"] == "contradicted" and status != "contradicted":
                if signal and signal["id"] not in claim["signal_ids"]:
                    claim["signal_ids"].append(signal["id"])
                continue
            claim.update(status=status, note=note[:300], checked_by="code", confidence=1.0 if status != "inconclusive" else 0.4)
            if signal and signal["id"] not in claim["signal_ids"]:
                claim["signal_ids"].append(signal["id"])
            source = self.inv.sources.get(source_id)
            if source and quote and quote_in(quote, source["content"]):
                claim.update(source_id=source["id"], quote=quote[:400], source=self.inv.sources.public(source))
            elif source and not claim.get("source_id"):
                claim.update(source_id=source["id"], source=self.inv.sources.public(source))
            self.inv.run.emit("claim", claim=claim)

    # ── dispatch ─────────────────────────────────────────────────────────────
    def reconcile(self, lead: dict[str, Any], assertions: list[dict[str, Any]]) -> None:
        handler = getattr(self, f"_{lead['tool']}", None)
        if handler:
            handler(lead, assertions)

    # ── registry ─────────────────────────────────────────────────────────────
    def _registry(self, lead: dict[str, Any], assertions: list[dict[str, Any]]) -> None:
        looked_up = lead["target"].get("name", "")
        is_alias = bool(looked_up) and not names_match(looked_up, self.name)
        entities = [e for e in _entities(assertions) if e.get("legal_name") or e.get("reg_no")]
        claimed_reg = self.profile.get("registration_no") or ""

        by_reg = next((e for e in entities if claimed_reg and e.get("reg_no") and reg_match(claimed_reg, e["reg_no"])), None)
        by_name = next((e for e in entities if e.get("legal_name") and names_match(e["legal_name"], looked_up or self.name)), None)
        match = by_reg or by_name

        if is_alias:
            self._alias_found(lead, looked_up, match)
            return

        if by_reg and by_reg.get("legal_name") and not names_match(by_reg["legal_name"], self.name):
            self._identity(by_reg["legal_name"], "registered", by_reg["source_id"])
            quote = by_reg["quotes"].get("reg_no") or by_reg["quotes"].get("legal_name", "")
            sig = self._finding(
                lead, "registry", "red", "high", "Registration number belongs to a different company",
                f"{claimed_reg} is registered to {by_reg['legal_name']} [{by_reg['source_id']}], not {self.name}.",
                rule="reg_mismatch", evidence=quote, sources=[by_reg["source_id"]],
                why="A genuine supplier quotes its own registration number. A number that belongs to another company is the signature of a middleman or an impersonator.",
            )
            self.set_claim("registration", "contradicted", f"The number is registered to {by_reg['legal_name']}.", signal=sig, source_id=by_reg["source_id"], quote=quote)
            self.set_claim("identity", "contradicted", f"The registry ties this number to {by_reg['legal_name']}, not {self.name}.", signal=sig, source_id=by_reg["source_id"], quote=quote)
            self._follow(lead, sig, "trade", {"name": by_reg["legal_name"]}, f"See whether {by_reg['legal_name']}, the entity that holds the registration, exports at all")
            self._follow(lead, sig, "web", {"query": f'"{self.name}" "{by_reg["legal_name"]}"'}, f"Look for any link between {self.name} and {by_reg['legal_name']}", 3)
            if by_reg.get("address"):
                self._follow(lead, sig, "address", {"address": by_reg["address"]}, f"Survey the address {by_reg['legal_name']} is registered at", 3)
            return

        if not match:
            self._finding(
                lead, "registry", "amber", "medium", "No registry record found",
                f"Searched registries for {self.name}{' / ' + claimed_reg if claimed_reg else ''} and found no matching record. The registry may simply not be indexed.",
                rule="registry_missing", why="A genuine company normally appears in at least one public registry; absence is a reason to ask for the licence, not proof of fraud.",
            )
            self.set_claim("identity", "inconclusive", "No registry record was found; the registry may not be indexed.")
            if claimed_reg:
                self.set_claim("registration", "inconclusive", "The number could not be found in any public registry.")
            return

        # An entity with this name or number was found. Record it, then compare every field it states.
        legal = match.get("legal_name") or self.name
        sid = match["source_id"]
        self._identity(legal, "registered", sid)
        quote = match["quotes"].get("legal_name") or match["quotes"].get("reg_no", "")
        if by_reg:
            sig = self._finding(
                lead, "registry", "green", "medium", "Registration number matches the company",
                f"{claimed_reg} is registered to {legal} [{sid}].", evidence=quote, sources=[sid],
            )
            self.set_claim("registration", "verified", f"The registry shows {claimed_reg} belongs to {legal}.", signal=sig, source_id=sid, quote=quote)
            self.set_claim("identity", "verified", f"{legal} is registered under this number.", signal=sig, source_id=sid, quote=quote)
        else:
            sig = self._finding(
                lead, "registry", "green", "low", "A company with this name is registered",
                f"{legal} appears in a registry [{sid}].", evidence=quote, sources=[sid],
            )
            self.set_claim("identity", "verified", f"A company named {legal} is registered.", signal=sig, source_id=sid, quote=quote)
            if claimed_reg and match.get("reg_no"):
                bad = self._finding(
                    lead, "registry", "red", "high", "Company name matches but the registration number does not",
                    f"{legal} is registered under {match['reg_no']} [{sid}], not {claimed_reg}.",
                    rule="reg_mismatch", evidence=match["quotes"].get("reg_no", ""), sources=[sid],
                    why="The name exists, but the number on the paperwork is not its number.",
                )
                self.set_claim("registration", "contradicted", f"The registry gives {match['reg_no']}, not {claimed_reg}.", signal=bad, source_id=sid, quote=match["quotes"].get("reg_no", ""))
                self._follow(lead, bad, "registry", {"reg_no": claimed_reg, "country": self.profile.get("country", "")}, f"Find out whose number {claimed_reg} is", 1)

        self._status(lead, match, legal)
        self._registered_address(lead, match, legal)
        self._scope(lead, match, legal)

    def _alias_found(self, lead: dict[str, Any], alias: str, match: dict[str, Any] | None) -> None:
        """A registry lookup for a name the supplier did not give us (found while following up a mismatch)."""
        if not match:
            self._finding(
                lead, "registry", "amber", "low", f"No registry record found for {alias}",
                f"{alias} came up while following a mismatch, but no registry record could be found for it.", rule="registry_missing",
            )
            return
        legal, sid = match.get("legal_name") or alias, match["source_id"]
        self._identity(legal, lead["target"].get("role", "linked"), sid)
        self._finding(
            lead, "registry", "amber", "low", f"{legal} is a registered company",
            f"{legal} is registered{' at ' + match['address'] if match.get('address') else ''} [{sid}]; it is not the name the supplier gave.",
            evidence=match["quotes"].get("legal_name", ""), sources=[sid],
        )

    def _status(self, lead: dict[str, Any], match: dict[str, Any], legal: str) -> None:
        sid = match["source_id"]
        status = (match.get("status") or "").lower().replace(" ", "_")
        if status in ("dissolved", "struck_off", "suspended"):
            sig = self._finding(
                lead, "registry", "red", "high", f"Registered company is {status.replace('_', ' ')}",
                f"{legal} is shown as {status.replace('_', ' ')} [{sid}].", rule="identity_conflict",
                evidence=match["quotes"].get("status", ""), sources=[sid],
                why="A company that no longer legally exists cannot take a deposit or honour an order.",
            )
            self.set_claim("identity", "contradicted", f"The registry shows {legal} as {status.replace('_', ' ')}.", signal=sig, source_id=sid, quote=match["quotes"].get("status", ""))
        if match.get("incorporated"):
            when = parse_date(match["incorporated"])
            if when and (date.today() - when).days < 365:
                self._finding(
                    lead, "registry", "amber", "medium", "Company was incorporated less than a year ago",
                    f"{legal} was incorporated {match['incorporated']} [{sid}].", evidence=match["quotes"].get("incorporated", ""), sources=[sid],
                    rule="new_company", why="Very new companies have no track record, and many fraud fronts are set up shortly before use.",
                )

    def _registered_address(self, lead: dict[str, Any], match: dict[str, Any], legal: str) -> None:
        claimed, sid = self.profile.get("address") or "", match["source_id"]
        if not claimed or not match.get("address"):
            return
        if addresses_match(claimed, match["address"]):
            sig = self._finding(
                lead, "registry", "green", "medium", "Registered address matches the paperwork",
                f"{legal} is registered at {match['address']} [{sid}], which matches the address given.", evidence=match["quotes"].get("address", ""), sources=[sid],
            )
            self.set_claim("address", "verified", "The registry's address matches the one given.", signal=sig, source_id=sid, quote=match["quotes"].get("address", ""))
        else:
            sig = self._finding(
                lead, "registry", "amber", "medium", "Registered address differs from the one given",
                f"{legal} is registered at {match['address']} [{sid}], but the paperwork says {claimed}.", evidence=match["quotes"].get("address", ""), sources=[sid],
                rule="address_mismatch", why="Factories can have a separate registered office, but a different address is worth surveying.",
            )
            self.set_claim("address", "inconclusive", f"The registry lists a different address: {match['address']}.", signal=sig, source_id=sid, quote=match["quotes"].get("address", ""))
            self._follow(lead, sig, "address", {"address": match["address"]}, "Survey the registered address to see which one is an industrial site", 2)

    def _scope(self, lead: dict[str, Any], match: dict[str, Any], legal: str) -> None:
        if self.profile.get("claimed_type") != "manufacturer":
            return
        sid = match["source_id"]
        scope = f"{match.get('business_scope', '')} {match.get('business_type', '')}"
        kind = (match.get("business_type") or "").lower()
        makes, trades = bool(_MAKES.search(scope)), bool(_TRADES.search(scope))
        quote = match["quotes"].get("business_scope") or match["quotes"].get("business_type", "")
        if (kind in ("trader", "service") or trades) and not makes and scope.strip():
            sig = self._finding(
                lead, "registry", "red", "high", "Registered business is trading, not manufacturing",
                f"{legal}'s registered scope is '{match.get('business_scope') or match.get('business_type')}' [{sid}]; nothing in it mentions manufacturing, yet the supplier presents as a factory.",
                rule="not_manufacturer", evidence=quote, sources=[sid],
                why="Trading companies posing as factories add a margin and give the buyer no control over quality or lead time.",
            )
            self.set_claim("capability", "contradicted", "The registered scope is trading, not manufacturing.", signal=sig, source_id=sid, quote=quote)
        elif makes:
            sig = self._finding(
                lead, "registry", "green", "low", "Registered scope includes manufacturing",
                f"{legal}'s registered scope includes production [{sid}].", evidence=quote, sources=[sid],
            )
            self.set_claim("capability", "inconclusive", "The registry allows manufacturing; a factory still needs to be seen (inspection or video).", signal=sig, source_id=sid, quote=quote)

    # ── customs and trade logs ───────────────────────────────────────────────
    def _trade(self, lead: dict[str, Any], assertions: list[dict[str, Any]]) -> None:
        name = lead["target"].get("name", "")
        records = [e for e in _entities(assertions) if e.get("trade_role") or e.get("shipments")]
        exporter = next((e for e in records if (e.get("trade_role") or "").lower() == "exporter"), None)
        is_alias = bool(name) and not names_match(name, self.name)
        subject = name or self.name
        if exporter:
            count = exporter.get("shipments", "")
            sig = self._finding(
                lead, "trade", "green", "low" if is_alias else "medium", f"Customs records show {subject} exporting",
                f"{subject} has {count + ' ' if count else ''}export shipment records [{exporter['source_id']}].",
                evidence=exporter["quotes"].get("shipments") or exporter["quotes"].get("trade_role", ""), sources=[exporter["source_id"]],
            )
            if not is_alias:
                self.set_claim("identity", "verified", f"Customs records exist for {subject}.", signal=sig, source_id=exporter["source_id"], quote=exporter["quotes"].get("trade_role", ""))
        elif not is_alias:
            self._finding(
                lead, "trade", "amber", "medium", "No customs or export history found",
                f"No export shipments were found under {subject}. New or small exporters, and records from some countries, are often missing.",
                rule="no_trade_history", why="An established exporter usually leaves a trail in customs data; absence means the supplier's track record is unproven.",
            )
        else:
            self._finding(
                lead, "trade", "amber", "low", f"No customs records under {subject}",
                f"{subject} (the entity that holds the registration) has no export records found; it may not export at all.", rule="no_trade_history",
            )

    # ── certificates ─────────────────────────────────────────────────────────
    def _certificate(self, lead: dict[str, Any], assertions: list[dict[str, Any]]) -> None:
        target = lead["target"]
        key = f"cert:{target.get('standard', '')}:{target.get('number', '')}"
        label = " ".join(x for x in (target.get("standard"), target.get("number")) if x) or "certificate"
        holder_claim = target.get("holder") or self.name
        entities = [e for e in _entities(assertions) if e.get("cert_holder") or e.get("cert_status") or e.get("cert_number")]
        by_number = next((e for e in entities if target.get("number") and e.get("cert_number") and reg_match(target["number"], e["cert_number"])), None)
        record = by_number or next((e for e in entities if e.get("cert_holder") and names_match(e["cert_holder"], holder_claim)), None)
        if not record and target.get("number"):
            # A page that names a holder and itself contains our certificate number is a record of that certificate,
            # even if the model didn't repeat the number as a separate field.
            wanted = normalize_reg(target["number"])

            def mentions_number(entity: dict[str, Any]) -> bool:
                source = self.inv.sources.get(entity["source_id"])
                return bool(source) and wanted in normalize_reg(source["content"])

            record = next((e for e in entities if e.get("cert_holder") and mentions_number(e)), None)
        if not record:
            self._finding(
                lead, "certificate", "amber", "medium", f"{label} not found in public directories",
                f"The {label} certificate could not be found in the certification directories searched. Many bodies do not publish a searchable list.",
                rule="cert_unverified", why="Ask the supplier for the certificate and verify it directly with the issuing body.",
            )
            self.set_claim("certification", "inconclusive", "Not found in public directories.", key=key)
            return
        sid, holder = record["source_id"], record.get("cert_holder") or ""
        status = (record.get("cert_status") or "").lower()
        quote = record["quotes"].get("cert_holder") or record["quotes"].get("cert_status", "")
        if holder and not names_match(holder, holder_claim):
            self._identity(holder, "certificate_holder", sid)
            sig = self._finding(
                lead, "certificate", "red", "high", f"{label} was issued to a different company",
                f"The certificate is held by {holder} [{sid}], not {holder_claim}.", rule="cert_invalid", evidence=quote, sources=[sid],
                why="Stolen or borrowed certificates are a standard way to pass as a qualified factory.",
            )
            self.set_claim("certification", "contradicted", f"Issued to {holder}, not {holder_claim}.", key=key, signal=sig, source_id=sid, quote=quote)
            self._follow(lead, sig, "registry", {"name": holder, "role": "certificate_holder"}, f"Find out who {holder} is and where it operates", 2)
        elif status in ("expired", "withdrawn", "suspended", "not_found"):
            sig = self._finding(
                lead, "certificate", "red", "high", f"{label} is {status.replace('_', ' ')}",
                f"The certificate is shown as {status.replace('_', ' ')} [{sid}].", rule="cert_invalid",
                evidence=record["quotes"].get("cert_status", ""), sources=[sid],
            )
            self.set_claim("certification", "contradicted", f"The certificate is {status.replace('_', ' ')}.", key=key, signal=sig, source_id=sid, quote=record["quotes"].get("cert_status", ""))
        else:
            sig = self._finding(
                lead, "certificate", "green", "medium", f"{label} confirmed",
                f"{label} is listed to {holder or holder_claim}{' as ' + status if status else ''} [{sid}].", evidence=quote, sources=[sid],
            )
            self.set_claim("certification", "verified", "Found in a public directory in the supplier's name.", key=key, signal=sig, source_id=sid, quote=quote)

    # ── addresses ────────────────────────────────────────────────────────────
    def _address(self, lead: dict[str, Any], assertions: list[dict[str, Any]]) -> None:
        address = lead["target"]["address"]
        is_claimed = addresses_match(address, self.profile.get("address") or "")
        survey = next((a for a in assertions if a["field"] == "address_zone"), None)
        use = next((a for a in assertions if a["field"] == "address_use"), None)
        manufacturer = self.profile.get("claimed_type") == "manufacturer"
        if use and use["value"].lower() in ("virtual_office", "coworking", "residential"):
            kind = use["value"].lower().replace("_", " ")
            sig = self._finding(
                lead, "address", "red", "medium", f"Address is described as a {kind}",
                f"A page describes {address} as a {kind} [{use['source_id']}].", rule="address_residential", evidence=use["quote"], sources=[use["source_id"]],
                why="A factory needs industrial premises; a mail-drop or flat suggests a front.",
            )
            if is_claimed and manufacturer:
                self.set_claim("capability", "contradicted", f"The address is a {kind}, not a factory site.", signal=sig, source_id=use["source_id"], quote=use["quote"])
        if not survey:
            return
        zone, sid = survey["value"], survey["source_id"]
        if zone == "industrial":
            sig = self._finding(
                lead, "address", "green", "medium", "Address is in an industrial area",
                f"The map shows industrial land use or buildings around {address} [{sid}].", evidence=survey["quote"], sources=[sid],
            )
            if is_claimed:
                self.set_claim("address", "verified" if self._claim_status("address") == "verified" else "inconclusive", "The address is in an industrial area.", signal=sig, source_id=sid, quote=survey["quote"])
        elif zone == "residential":
            polarity, severity = ("red", "medium") if manufacturer else ("amber", "low")
            sig = self._finding(
                lead, "address", polarity, severity, "Address is in a residential area",
                f"The map shows mostly housing around {address} [{sid}]{', yet the supplier presents as a factory' if manufacturer else ''}.",
                rule="address_residential", evidence=survey["quote"], sources=[sid],
                why="Factories sit in industrial zones. Map data can be incomplete, so ask for a live video of the site.",
            )
            if is_claimed and manufacturer:
                self.set_claim("capability", "contradicted", "The map shows a residential area at the address.", signal=sig, source_id=sid, quote=survey["quote"])
            self._follow(lead, sig, "web", {"query": f'"{address}" factory OR apartment OR residential'}, "Check whether anything describes a factory at this address", 3)
        elif zone == "commercial":
            self._finding(
                lead, "address", "amber", "low", "Address is in a commercial area",
                f"The map shows offices or shops around {address} [{sid}], not industrial land.", evidence=survey["quote"], sources=[sid],
            )

    def _claim_status(self, claim_type: str) -> str:
        return next((c["status"] for c in self.inv.claims if c["type"] == claim_type), "inconclusive")

    # ── photos ───────────────────────────────────────────────────────────────
    def _image(self, lead: dict[str, Any], assertions: list[dict[str, Any]]) -> None:
        hits = [a for a in assertions if a["field"] == "image_match_domain"]
        if not hits:
            if lead["status"] != "unavailable":
                self._finding(
                    lead, "image", "green", "low", "No other site uses this photo",
                    "Reverse-image search found no other web page using this photo. The search is not exhaustive.",
                )
                self.set_claim("imagery", "inconclusive", "No other page uses the photo, but reverse-image search is not exhaustive.")
            return
        for hit in hits[:3]:
            domain = hit["value"]
            sig = self._finding(
                lead, "image", "amber", "medium", f"Photo also appears on {domain}",
                f"The same photo is used on {hit['quote'].split(' also appears on ')[-1]} [{hit['source_id']}].", evidence=hit["quote"],
                sources=[hit["source_id"]], rule="image_candidate", why="A photo that belongs to another company is the commonest way to fake a factory.",
            )
            self._follow(
                lead, sig, "web", {"query": f"{domain} company about us manufacturer address", "role": "image_owner", "domain": domain},
                f"Identify who owns {domain}, where the photo also appears", 1,
            )

    def _web(self, lead: dict[str, Any], assertions: list[dict[str, Any]]) -> None:
        target = lead["target"]
        if target.get("role") == "image_owner":
            return self._image_owner(lead, assertions)
        reports = [a for a in assertions if a["field"] == "reports"]
        if reports:
            first = reports[0]
            self._finding(
                lead, "reports", "red", "medium", "Public reports about this company",
                f"A source reports: {first['value']} [{first['source_id']}].", evidence=first["quote"], sources=[first["source_id"]],
                rule="scam_reports", why="Check whether the reports concern this company or one that merely shares the name.",
            )

    def _image_owner(self, lead: dict[str, Any], assertions: list[dict[str, Any]]) -> None:
        domain = lead["target"].get("domain", "that site")
        owner = next((a for a in assertions if a["field"] in ("owner_name", "legal_name")), None)
        if not owner:
            self._finding(
                lead, "image", "amber", "low", f"Could not identify who runs {domain}",
                f"No page identified the company behind {domain}, so the shared photo is unresolved.",
            )
            return
        self._identity(owner["value"], "photo_owner", owner["source_id"])
        if names_match(owner["value"], self.name):
            sig = self._finding(
                lead, "image", "green", "low", f"{domain} belongs to the supplier",
                f"{domain} is run by {owner['value']} [{owner['source_id']}], so the shared photo is the supplier's own.", evidence=owner["quote"], sources=[owner["source_id"]],
            )
            self.set_claim("imagery", "verified", f"The photo's other location is the supplier's own site ({domain}).", signal=sig, source_id=owner["source_id"], quote=owner["quote"])
            return
        sig = self._finding(
            lead, "image", "red", "high", f"Photo belongs to {owner['value']}, not the supplier",
            f"The supplier's photo also appears on {domain}, run by {owner['value']} [{owner['source_id']}], a different company.",
            rule="image_reuse", evidence=owner["quote"], sources=[owner["source_id"]],
            why="Photos taken from another manufacturer's site suggest the supplier is a middleman or a front.",
        )
        self.set_claim("imagery", "contradicted", f"The photo is from {owner['value']} ({domain}).", signal=sig, source_id=owner["source_id"], quote=owner["quote"])
        self._follow(lead, sig, "trade", {"name": owner["value"]}, f"See whether {owner['value']} is the real factory behind the listing", 2)

    # ── domains ──────────────────────────────────────────────────────────────
    def _domain(self, lead: dict[str, Any], assertions: list[dict[str, Any]]) -> None:
        fact = next((a for a in assertions if a["field"] == "domain_age_days"), None)
        if not fact:
            return
        domain, sid = lead["target"]["domain"], fact["source_id"]
        if fact["value"] == "missing":
            self._finding(lead, "domain", "red", "medium", f"No registration record for {domain}", f"The registry has no record of {domain} [{sid}].", rule="domain_new", sources=[sid])
            return
        days = int(fact["value"])
        age = f"{days} days" if days < 120 else f"{days // 365} years" if days >= 730 else f"{days // 30} months"
        if days < 90:
            polarity, severity, title = "red", "medium", "Supplier's website domain is very new"
        elif days < 365:
            polarity, severity, title = "amber", "medium", "Supplier's website domain is less than a year old"
        else:
            self._finding(lead, "domain", "green", "low", "Supplier's website domain has history", f"{domain} was registered {age} ago [{sid}].", sources=[sid])
            return
        sig = self._finding(
            lead, "domain", polarity, severity, title, f"{domain} was registered {age} ago [{sid}].", rule="domain_new", evidence=fact["quote"], sources=[sid],
            why="A long-established factory usually has a long-established website; fronts register new domains.",
        )
        self._follow(lead, sig, "web", {"query": f"{domain} reviews scam complaints"}, f"Look for reports about the new domain {domain}", 3)

    # ── facts known from the paperwork alone ─────────────────────────────────
    def check_payment(self) -> None:
        """The account holder named on the invoice must be the company that issued it. No lookup needed."""
        beneficiary = (self.profile.get("payment") or {}).get("beneficiary") or ""
        if not beneficiary or not self.name:
            return
        if names_match(beneficiary, self.name):
            self.set_claim("payment", "inconclusive", "The account holder's name matches the company's; the account itself can't be verified from here.")
            return
        sig = self.inv.signals.add(
            "payment", "red", "high", "Payment account is not in the company's name",
            f"The invoice asks for payment to an account held by {beneficiary}, but the supplier is {self.name}.",
            evidence=beneficiary, rule="beneficiary_mismatch",
            why="Paying a different name than the one on the invoice is the main way deposits are diverted, and it voids most buyer protection.",
        )
        self.set_claim("payment", "contradicted", f"The account holder is {beneficiary}, not {self.name}.", signal=sig)
        self._identity(beneficiary, "beneficiary", None)
        if _COMPANY_WORDS.search(beneficiary):
            new = self.inv.case.add("registry", {"name": beneficiary, "role": "beneficiary", "country": self.profile.get("country", "")},
                                    f"Find out who {beneficiary}, the account holder, is", parent_finding=sig["id"], priority=1)
            if new:
                sig["spawned"].append(new["id"])

