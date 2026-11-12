"""Rules that sit on top of the models. Code, not a model, has the last word on these.

Methodology version 3 (supplier verification); the reasoning behind each rule is in docs/risk-methodology.md.
"""
from __future__ import annotations

import re
from typing import Any

METHODOLOGY_VERSION = 3

DECISIONS = ("PROCEED", "VERIFY_FIRST", "STOP")
DECISION_LABEL = {"PROCEED": "Proceed", "VERIFY_FIRST": "Verify first", "STOP": "Stop"}
# What a supplier tells the buyer that can be checked against an independent source.
CLAIM_TYPES = ("identity", "registration", "address", "capability", "certification", "imagery", "payment")
STATUSES = ("verified", "contradicted", "inconclusive")
POLARITIES = ("red", "green", "amber")

# Tools a lead may use. The planner model may only pick from this list.
TOOLS = ("registry", "trade", "certificate", "domain", "address", "image", "web")

# Payment terms that are risky however the rest of the checks come out.
MONEY_RULES = ("personal_account", "irreversible_payment", "paypal_unprotected", "full_prepayment", "beneficiary_mismatch")
# Findings that show the supplier is not who it says it is. A Stop cannot be argued down past these.
IDENTITY_RULES = ("reg_mismatch", "cert_invalid", "image_reuse", "identity_conflict")
HARD_RULES = MONEY_RULES + IDENTITY_RULES
# Signals that rule out a Proceed whatever the model concludes.
BLOCKS_PROCEED = HARD_RULES + ("prompt_injection", "off_platform", "address_residential", "not_manufacturer")

# Which kinds of lead produce the evidence for each kind of claim.
EVIDENCE_FOR = {
    "identity": ("registry", "trade", "web"),
    "registration": ("registry",),
    "address": ("address", "registry", "web"),
    "capability": ("trade", "registry", "address", "web"),
    "certification": ("certificate", "web"),
    "imagery": ("image", "web"),
    "payment": ("web", "domain"),
}
_REF = re.compile(r"^[FCSL]\d{1,3}$")
_INLINE_REF = re.compile(r"\[([FCSL]\d{1,3})\]")


def guardrail(decision: str, signals: list[dict[str, Any]]) -> tuple[str, str | None]:
    """The model may never green-light a supplier with a hard red flag or an unresolved identity conflict.
    Returns the decision to use and, if it changed, why."""
    blocker = next((s for s in signals if s["rule"] in BLOCKS_PROCEED), None)
    if decision == "PROCEED" and blocker:
        return "VERIFY_FIRST", f"Downgraded from PROCEED because of [{blocker['id']}] {blocker['title'].lower()}."
    return decision, None


def challenge_outcome(should_be: str, doubt: str, decision: str) -> str:
    """The challenger names the decision it thinks is right and how much doubt is left; this turns that into an outcome."""
    if should_be in DECISIONS and should_be != decision:
        return "overturned"
    return "weakened" if doubt == "serious" else "holds"


def apply_challenge(judgement: dict[str, Any], challenge: dict[str, Any], signals: list[dict[str, Any]]) -> str | None:
    """What a challenge may change. The challenger can lower confidence, and when the two models disagree outright
    the answer becomes Verify first, except that a hard red flag keeps a Stop. Returns the change, if any."""
    outcome, before, confidence = challenge.get("outcome"), judgement["decision"], judgement["confidence"]
    if outcome not in ("weakened", "overturned"):
        return None
    hard = next((s for s in signals if s["rule"] in HARD_RULES), None)
    if outcome == "weakened" or before == "VERIFY_FIRST":
        judgement["confidence"] = max(40, confidence - 15)
        effect = f"Confidence lowered from {confidence} to {judgement['confidence']}: the challenger found a credible counterpoint."
    elif before == "STOP" and hard:
        judgement["confidence"] = max(50, confidence - 20)
        effect = f"The challenger disputed this verdict, but it stays Stop because of [{hard['id']}] {hard['title'].lower()}."
    else:
        judgement["decision"], judgement["confidence"] = "VERIFY_FIRST", min(confidence, 60)
        judgement["decision_before_challenge"] = before
        effect = (
            f"Changed from {DECISION_LABEL[before]} to Verify first. Ultra and Super disagree, "
            "and when they do, the safe answer is to verify."
        )
    judgement["challenge_effect"] = challenge["effect"] = effect
    return effect
