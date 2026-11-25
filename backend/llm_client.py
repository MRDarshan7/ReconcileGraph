"""Resilient 3-key failover Gemini structured generation client."""

from __future__ import annotations

import os
from typing import Any, TypeVar

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel

load_dotenv()

T = TypeVar("T", bound=BaseModel)


class AIAgentsInaccessibleError(RuntimeError):
    """Raised when no Gemini API keys are configured or all keys fail."""

    def __init__(self, stage_name: str, failures: list[str]) -> None:
        self.stage_name = stage_name
        self.failures = failures
        joined = "; ".join(failures) if failures else "No Gemini API keys configured"
        super().__init__(f"AI agents inaccessible during {stage_name}: {joined}")


def get_configured_keys() -> list[str]:
    """Read up to 3 Gemini API keys from GEMINI_API_KEYS or individual fallback vars."""
    load_dotenv(override=False)

    keys: list[str] = []
    raw_multi = os.getenv("GEMINI_API_KEYS", "").strip()
    if raw_multi:
        keys.extend(part.strip() for part in raw_multi.split(",") if part.strip())

    if not keys:
        for var_name in ("GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY"):
            val = os.getenv(var_name, "").strip()
            if val and val not in keys:
                keys.append(val)

    return keys[:3]


def get_model_name() -> str:
    """Return configured Gemini model name."""
    load_dotenv(override=False)
    return os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"


def _parse_response(response: Any, response_schema: type[T]) -> T:
    """Parse structured Pydantic output from google-genai response."""
    parsed = getattr(response, "parsed", None)
    if parsed is not None:
        if isinstance(parsed, response_schema):
            return parsed
        if isinstance(parsed, dict):
            return response_schema.model_validate(parsed)

    text = getattr(response, "text", None)
    if text:
        return response_schema.model_validate_json(text)

    raise ValueError("Gemini response contained neither parsed object nor JSON text")


def generate_structured(
    prompt: str, response_schema: type[T], stage_name: str
) -> tuple[T, dict[str, Any]]:
    """Call Gemini with structured JSON output, failing over across up to 3 API keys."""
    keys = get_configured_keys()
    if not keys:
        raise AIAgentsInaccessibleError(
            stage_name, ["No Gemini API keys configured in GEMINI_API_KEYS or GEMINI_API_KEY*"]
        )

    model = get_model_name()
    failures: list[str] = []

    for idx, key in enumerate(keys, start=1):
        key_slot = f"Key #{idx}"
        try:
            client = genai.Client(api_key=key)
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=response_schema,
                    temperature=0.1,
                ),
            )
            parsed_obj = _parse_response(response, response_schema)
            return parsed_obj, {
                "mode": "LIVE_GEMINI",
                "key_slot": key_slot,
                "attempts": idx,
                "stage_name": stage_name,
                "failures": failures,
            }
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{key_slot} failed ({type(exc).__name__}: {exc})")

    raise AIAgentsInaccessibleError(stage_name, failures)
