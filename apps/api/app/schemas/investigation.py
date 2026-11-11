"""Request bodies for investigations. Responses are plain dicts built from the run and its report."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator


class InvestigationRequest(BaseModel):
    """Supplier paperwork (pasted text, a transcribed screenshot) and/or structured fields. At least one is required."""

    message: str = Field(default="", max_length=8000)
    sender: str = Field(default="", max_length=200)
    channel: str = Field(default="", max_length=60)
    # Structured fields. When given, they win over what the model reads from the paperwork.
    company: str = Field(default="", max_length=160)
    address: str = Field(default="", max_length=300)
    registration_no: str = Field(default="", max_length=80)
    certificate_no: str = Field(default="", max_length=80)
    deposit: str = Field(default="", max_length=120)
    listing_url: str = Field(default="", max_length=400)
    image_urls: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("listing_url")
    @classmethod
    def _http_only(cls, value: str) -> str:
        value = value.strip()
        if value and not value.lower().startswith(("http://", "https://")):
            raise ValueError("The listing link must start with http:// or https://")
        return value

    @field_validator("image_urls")
    @classmethod
    def _image_links(cls, value: list[str]) -> list[str]:
        links = [v.strip() for v in value if v.strip()]
        if any(not v.lower().startswith(("http://", "https://")) or len(v) > 600 for v in links):
            raise ValueError("Photo links must be http(s) URLs")
        return links

    @model_validator(mode="after")
    def _something_to_check(self) -> "InvestigationRequest":
        has_text = len(self.message.strip()) >= 40
        has_identity = bool(self.company.strip() or self.registration_no.strip() or self.listing_url)
        if not (has_text or has_identity):
            raise ValueError("Paste the invoice or listing (at least 40 characters), or give the company name or registration number.")
        return self
