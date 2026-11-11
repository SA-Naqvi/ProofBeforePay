"""Pattern rules over invoices, listings and chat text. Each fires on a phrase and keeps the sentence it came from."""
from __future__ import annotations

import re
from dataclasses import dataclass

@dataclass(frozen=True)
class Rule:
    id: str
    title: str
    severity: str
    pattern: re.Pattern[str]
    why: str

def _rx(pattern: str) -> re.Pattern[str]:
    return re.compile(pattern, re.I)

RULES = (
    Rule(
        "personal_account",
        "Asks you to pay a personal or third-party account",
        "high",
        _rx(r"\b(?:personal|private|individual|director'?s|boss'?s|manager'?s|wife'?s|friend'?s|another|different|third[- ]party)\s+(?:bank\s+)?(?:account|card)\b"
            r"|\b(?:pay|transfer|wire|remit|send)\b[^.\n]{0,60}\b(?:to\s+(?:my|our|his|her)\s+(?:personal|private)|to\s+an?\s+(?:individual|personal))\b"
            r"|\baccount\s+(?:name|holder)\b[^.\n]{0,40}\b(?:is|:)\s*(?:mr|mrs|ms|miss)\.?\s+\w+"),
        "A real manufacturer invoices from a company account whose name matches the company on the invoice.",
    ),
    Rule(
        "irreversible_payment",
        "Mentions hard-to-reverse payment methods",
        "high",
        _rx(r"\b(?:bitcoin|btc|usdt|crypto(?:currency)?|gift\s*cards?|western\s+union|moneygram|zelle|cash\s*app|paypal\s+friends)\b"),
        "Crypto, gift cards and wire services can't be recalled, which is why fraud prefers them.",
    ),
    Rule(
        "full_prepayment",
        "Asks for most or all of the payment upfront",
        "high",
        _rx(r"\b(?:100|9\d|8\d|7\d)\s?%\s+(?:payment\s+)?(?:in\s+advance|upfront|up\s+front|prepay\w*|before\s+(?:production|shipment|shipping))\b"
            r"|\b(?:full|entire)\s+(?:payment|amount)\s+(?:in\s+advance|upfront|before\s+(?:production|shipping|shipment))\b"
            r"|\bpay(?:ment)?\s+(?:in\s+full\s+)?(?:before|prior\s+to)\s+(?:production|shipment|shipping|inspection)\b"),
        "Standard terms for a new supplier are a deposit of around 30% with the balance against inspection or shipping documents.",
    ),
    Rule(
        "off_platform",
        "Pushes the deal off the platform's buyer protection",
        "medium",
        _rx(r"\b(?:avoid|bypass|skip|without)\b[^.\n]{0,40}\b(?:trade\s+assurance|escrow|platform\s+fee|alibaba\s+fee|commission)\b"
            r"|\b(?:pay|payment)\b[^.\n]{0,40}\b(?:outside|off)\s+(?:the\s+)?(?:platform|alibaba|indiamart|site)\b"
            r"|\b(?:move|continue|talk|chat)\b[^.\n]{0,40}\b(?:to\s+)?(?:whatsapp|telegram|wechat|skype)\b[^.\n]{0,40}\b(?:pay|payment|invoice|deal)\b"),
        "Buyer protection only covers payments made through the platform.",
    ),
    Rule(
        "inspection_refusal",
        "Resists inspection, video calls or sample checks",
        "medium",
        _rx(r"\b(?:no|not\s+allow\w*|cannot|can'?t|unable\s+to|refuse\w*)\b[^.\n]{0,30}\b(?:factory\s+(?:visit|tour|inspection|audit)|third[- ]party\s+inspection|video\s+(?:call|tour)|site\s+visit)\b"),
        "Genuine factories routinely allow inspections and video tours.",
    ),
    Rule(
        "prompt_injection",
        "Text contains instructions aimed at AI checkers",
        "high",
        _rx(r"\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:(?:previous|prior|above|earlier|your|the)\s+)+(?:instructions|rules|prompts?|guidelines)\b"
            r"|\b(?:classify|mark|rate|label|treat|flag)\s+(?:this|the)\s+(?:message|email|invoice|listing|supplier|offer|text)\s+as\s+(?:safe|legitimate|legit|genuine|verified|trusted)\b"
            r"|\b(?:ai|automated|language\s+model|llm|assistant|scanner|checker)s?\b[^.\n]{0,40}\b(?:must|should)\s+(?:classify|mark|rate|label|respond|answer|reply|output|return)\b"
            r"|\bnote\s+to\s+(?:the\s+)?(?:ai|assistants?|llms?|language\s+models?)\b"),
        "Genuine paperwork doesn't address automated checkers. Text like this tries to steer screening tools.",
    ),
    Rule(
        "pressure",
        "Pressure to pay fast",
        "low",
        _rx(r"\b(?:urgent(?:ly)?|within\s+(?:\d{1,2}|twenty[- ]four|forty[- ]eight)\s+hours|asap|price\s+(?:will\s+)?(?:goes?\s+up|expires?)|limited\s+(?:stock|slots|quantity)|act\s+now|today\s+only|last\s+(?:chance|batch))\b"),
        "Urgency is used to stop you from checking.",
    ),
)

def _sentence_around(text: str, start: int, end: int) -> str:
    left = max(text.rfind(ch, 0, start) for ch in ".!?\n") + 1
    rights = [i for i in (text.find(ch, end) for ch in ".!?\n") if i != -1]
    right = min(rights) + 1 if rights else len(text)
    sentence = " ".join(text[left:right].split())
    return sentence if len(sentence) <= 220 else sentence[:219] + "…"
