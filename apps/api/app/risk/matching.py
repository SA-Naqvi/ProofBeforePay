"""Deterministic comparison of what a supplier claims with what a source says. Code, not a model, decides whether
two names, registration numbers or addresses are the same thing."""
from __future__ import annotations

import re
import unicodedata

# Words that say what kind of entity a name is, not which one. "Shenzhen Kolor Trading Co., Ltd." is "kolor".
_LEGAL = {
    "co", "ltd", "limited", "inc", "incorporated", "llc", "llp", "corp", "corporation", "company", "pvt", "private",
    "pte", "plc", "gmbh", "sa", "srl", "bv", "ag", "oy", "ab", "as", "sdn", "bhd", "jsc", "the", "and", "of", "fze",
    "fzc", "llc", "lp", "trading", "group", "holdings", "enterprise", "enterprises", "industry", "industries",
    "international", "intl", "global", "technology", "technologies", "tech", "manufacturing", "mfg", "factory",
    "import", "export", "imp", "exp", "china", "india",
}
_ADDRESS_NOISE = {
    "road", "rd", "street", "st", "avenue", "ave", "lane", "ln", "district", "city", "province", "state", "floor",
    "fl", "room", "rm", "no", "number", "building", "bldg", "block", "unit", "suite", "ste", "the", "of", "and",
    "zone", "area", "near", "opp", "opposite", "tower", "plot",
}


def _ascii(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def name_tokens(name: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", _ascii(name)) if t not in _LEGAL and len(t) > 1]


def names_match(a: str, b: str) -> bool:
    """True when two company names plausibly refer to the same entity once legal suffixes and city prefixes are ignored."""
    ta, tb = set(name_tokens(a)), set(name_tokens(b))
    if not ta or not tb:
        return _ascii(a).strip() == _ascii(b).strip() and bool(a.strip())
    shared = ta & tb
    smaller = min(len(ta), len(tb))
    # Everything the shorter name says appears in the longer one ("Kolor" vs "Shenzhen Kolor"), with at least one
    # distinctive token in common so a shared city name alone is never a match.
    return len(shared) / smaller >= 0.8 and any(len(t) >= 4 for t in shared)


def normalize_reg(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def reg_match(a: str, b: str) -> bool:
    na, nb = normalize_reg(a), normalize_reg(b)
    return len(na) >= 5 and len(nb) >= 5 and (na == nb or na in nb or nb in na)


def address_tokens(address: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", _ascii(address)) if t not in _ADDRESS_NOISE and len(t) > 1}


def addresses_match(a: str, b: str) -> bool:
    """Same place: the street numbers and postcode agree and most of the rest overlaps."""
    ta, tb = address_tokens(a), address_tokens(b)
    if not ta or not tb:
        return False
    numbers_a, numbers_b = {t for t in ta if t.isdigit()}, {t for t in tb if t.isdigit()}
    if numbers_a and numbers_b and not (numbers_a & numbers_b):
        return False
    return len(ta & tb) / min(len(ta), len(tb)) >= 0.6


def quote_in(quote: str, content: str) -> bool:
    """A quote is only kept when it appears word for word in the page it is attributed to."""
    squash = lambda s: " ".join(s.lower().split())  # noqa: E731
    q = squash(quote)
    return bool(q) and q[:80] in squash(content)
