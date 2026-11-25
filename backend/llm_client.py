"""Resilient 3-key failover Gemini structured generation client."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, TypeVar

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / ".env"

# Load project-root .env on startup regardless of cwd, overriding stale shell vars.
load_dotenv(ENV_PATH, override=True)

T = TypeVar("T", bound=BaseModel)

FALLBACK_GEMINI_MODELS: tuple[str, ...] = ("gemini-3.5-flash", "gemini-3-flash-preview")
_RETIRED_MODEL_REDIRECT: dict[str, str] = {}


def summarize_failures(failures: list[str]) -> str:
    """Produce a concise, secret-free root-cause summary from key failure strings."""
    if not failures:
        if not ENV_PATH.exists():
            return "Missing .env file and no API keys configured"
        return "No Gemini API keys configured"

    joined = " ".join(failures).lower()
    reasons: list[str] = []
    if "no gemini api keys" in joined:
        reasons.append("No API keys configured" if ENV_PATH.exists() else "Missing .env / No API keys")
    if "401" in joined or "403" in joined or "api_key_invalid" in joined or "invalid api key" in joined:
        reasons.append("401/403 Invalid API Key")
    if "429" in joined or "resource_exhausted" in joined or "quota" in joined:
        reasons.append("429 Quota Exceeded")
    if "404" in joined or "not_found" in joined:
        reasons.append("404 Model Not Found")
    if "503" in joined or "unavailable" in joined:
        reasons.append("503 Model Temporarily Unavailable")
    if "timeout" in joined or "timed out" in joined:
        reasons.append("Request Timeout")

    return "; ".join(reasons) if reasons else failures[0][:120]


class AIAgentsInaccessibleError(RuntimeError):
    """Raised when no Gemini API keys are configured or all keys fail."""

    def __init__(self, stage_name: str, failures: list[str]) -> None:
        self.stage_name = stage_name
        self.failures = failures
        self.summary_reason = summarize_failures(failures)
        joined = "; ".join(failures) if failures else "No Gemini API keys configured"
        super().__init__(f"AI agents inaccessible during {stage_name}: {joined}")


def get_configured_keys() -> list[str]:
    """Read up to 3 Gemini API keys from GEMINI_API_KEYS or individual fallback vars."""
    load_dotenv(ENV_PATH, override=False)

    keys: list[str] = []
    raw_multi = os.getenv("GEMINI_API_KEYS", "").strip()
    if raw_multi:
        keys.extend(part.strip() for part in raw_multi.split(",") if part.strip())

    if not keys:
        for var_name in (
            "GEMINI_API_KEY_1",
            "GEMINI_API_KEY_2",
            "GEMINI_API_KEY_3",
            "GEMINI_API_KEY",
        ):
            val = os.getenv(var_name, "").strip()
            if val and val not in keys:
                keys.append(val)

    return keys[:3]


def get_model_name() -> str:
    """Return configured Gemini model name."""
    load_dotenv(ENV_PATH, override=False)
    return os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip() or "gemini-3.5-flash"


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
        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()
        return response_schema.model_validate_json(cleaned)

    raise ValueError("Gemini response contained neither parsed object nor JSON text")


def _call_model_with_schema_fallback(
    client: genai.Client,
    model: str,
    prompt: str,
    response_schema: type[T],
) -> T:
    """Call Gemini with response_schema, falling back to JSON-mode prompt if schema is rejected."""
    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=response_schema,
                temperature=0.1,
            ),
        )
        return _parse_response(response, response_schema)
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        is_schema_error = (
            "additionalproperties" in msg
            or "response_schema" in msg
            or ("400" in msg and "schema" in msg)
        )
        if not is_schema_error:
            raise

        schema_json = response_schema.model_json_schema()
        json_prompt = (
            f"{prompt}\n\nRespond ONLY with valid JSON matching this JSON Schema:\n{schema_json}"
        )
        response = client.models.generate_content(
            model=model,
            contents=json_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        return _parse_response(response, response_schema)


def generate_structured(
    prompt: str, response_schema: type[T], stage_name: str
) -> tuple[T, dict[str, Any]]:
    """Call Gemini with structured JSON output, failing over across up to 3 API keys."""
    keys = get_configured_keys()
    if not keys:
        raise AIAgentsInaccessibleError(
            stage_name, ["No Gemini API keys configured in GEMINI_API_KEYS or GEMINI_API_KEY*"]
        )

    configured_model = get_model_name()
    effective_model = _RETIRED_MODEL_REDIRECT.get(configured_model, configured_model)
    failures: list[str] = []

    for idx, key in enumerate(keys, start=1):
        key_slot = f"Key #{idx}"
        try:
            client = genai.Client(api_key=key)
            try:
                parsed_obj = _call_model_with_schema_fallback(
                    client, effective_model, prompt, response_schema
                )
                used_model = effective_model
            except Exception as model_exc:  # noqa: BLE001
                err_lower = str(model_exc).lower()
                is_retired_404 = "404" in err_lower or "not_found" in err_lower
                if not is_retired_404:
                    raise
                # Retry on current live flash models when configured model is retired/404.
                parsed_obj = None
                used_model = effective_model
                last_model_exc: Exception = model_exc
                for fallback_model in FALLBACK_GEMINI_MODELS:
                    if fallback_model == effective_model:
                        continue
                    try:
                        parsed_obj = _call_model_with_schema_fallback(
                            client, fallback_model, prompt, response_schema
                        )
                        used_model = fallback_model
                        _RETIRED_MODEL_REDIRECT[configured_model] = fallback_model
                        break
                    except Exception as fb_exc:  # noqa: BLE001
                        last_model_exc = fb_exc
                if parsed_obj is None:
                    raise last_model_exc

            return parsed_obj, {
                "mode": "LIVE_GEMINI",
                "key_slot": key_slot,
                "model": used_model,
                "attempts": idx,
                "stage_name": stage_name,
                "failures": failures,
            }
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{key_slot} failed ({type(exc).__name__}: {exc})")

    raise AIAgentsInaccessibleError(stage_name, failures)
