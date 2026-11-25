"""Resilient tiered LLM client: Gemini (3 keys, 8s timeout) -> Groq (3 keys, 10s timeout)."""

from __future__ import annotations

import inspect
import json
import os
from pathlib import Path
from typing import Any, TypeVar

import httpx
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / ".env"

# Load project-root .env on startup regardless of cwd, overriding stale shell vars.
load_dotenv(ENV_PATH, override=True)

T = TypeVar("T", bound=BaseModel)

GEMINI_TIMEOUT_MS = 8000
GROQ_TIMEOUT_SECONDS = 10.0
GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

FALLBACK_GEMINI_MODELS: tuple[str, ...] = ("gemini-3.5-flash", "gemini-3-flash-preview")
FALLBACK_GROQ_MODELS: tuple[str, ...] = (
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
)
_RETIRED_MODEL_REDIRECT: dict[str, str] = {}


def summarize_failures(failures: list[str]) -> str:
    """Produce a concise, secret-free root-cause summary from key failure strings."""
    if not failures:
        if not ENV_PATH.exists():
            return "Missing .env file and no API keys configured"
        return "No Gemini or Groq API keys configured"

    joined = " ".join(failures).lower()
    reasons: list[str] = []
    if "no gemini or groq api keys" in joined or "no api keys configured" in joined:
        reasons.append("No API keys configured" if ENV_PATH.exists() else "Missing .env / No API keys")
    if "401" in joined or "403" in joined or "api_key_invalid" in joined or "invalid api key" in joined:
        reasons.append("401/403 Invalid API Key")
    if "429" in joined or "resource_exhausted" in joined or "quota" in joined or "rate limit" in joined:
        reasons.append("429 Quota Exceeded")
    if "404" in joined or "not_found" in joined:
        reasons.append("404 Model Not Found")
    if "503" in joined or "unavailable" in joined:
        reasons.append("503 Model Temporarily Unavailable")
    if "timeout" in joined or "timed out" in joined:
        reasons.append("Request Timeout")

    return "; ".join(reasons) if reasons else failures[0][:120]


class AIAgentsInaccessibleError(RuntimeError):
    """Raised when all configured Gemini and Groq API keys fail or none are configured."""

    def __init__(self, stage_name: str, failures: list[str]) -> None:
        self.stage_name = stage_name
        self.failures = failures
        self.summary_reason = summarize_failures(failures)
        joined = "; ".join(failures) if failures else "No Gemini or Groq API keys configured"
        super().__init__(f"AI agents inaccessible during {stage_name}: {joined}")


def _read_key_list(multi_var: str, single_vars: tuple[str, ...]) -> list[str]:
    load_dotenv(ENV_PATH, override=False)

    keys: list[str] = []
    raw_multi = os.getenv(multi_var, "").strip()
    if raw_multi:
        keys.extend(part.strip() for part in raw_multi.split(",") if part.strip())

    if not keys:
        for var_name in single_vars:
            val = os.getenv(var_name, "").strip()
            if val and val not in keys:
                keys.append(val)

    return keys[:3]


def get_configured_keys() -> list[str]:
    """Read up to 3 Gemini API keys from GEMINI_API_KEYS or individual fallback vars."""
    return _read_key_list(
        "GEMINI_API_KEYS",
        ("GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY"),
    )


def get_configured_groq_keys() -> list[str]:
    """Read up to 3 Groq API keys from GROQ_API_KEYS or individual fallback vars."""
    return _read_key_list(
        "GROQ_API_KEYS",
        ("GROQ_API_KEY_1", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY"),
    )


def get_model_name() -> str:
    """Return configured Gemini model name."""
    load_dotenv(ENV_PATH, override=False)
    return os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip() or "gemini-3.5-flash"


def get_groq_model_name() -> str:
    """Return configured Groq model name."""
    load_dotenv(ENV_PATH, override=False)
    return (
        os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
        or "llama-3.3-70b-versatile"
    )


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    return cleaned


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
        return response_schema.model_validate_json(_strip_code_fences(text))

    raise ValueError("Gemini response contained neither parsed object nor JSON text")


def _build_gemini_client(api_key: str) -> Any:
    """Instantiate genai.Client with 8s HTTP timeout when supported by the client class."""
    try:
        sig = inspect.signature(genai.Client)
        if "http_options" in sig.parameters:
            return genai.Client(
                api_key=api_key,
                http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS),
            )
    except (TypeError, ValueError):
        pass
    return genai.Client(api_key=api_key)


def _is_network_or_timeout_error(exc: Exception) -> bool:
    if isinstance(exc, (TimeoutError, httpx.TimeoutException, httpx.ConnectError)):
        return True
    msg = str(exc).lower()
    return any(tok in msg for tok in ("timeout", "timed out", "connecterror", "connection reset"))


def _call_model_with_schema_fallback(
    client: Any,
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

        schema_json = json.dumps(response_schema.model_json_schema())
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


def _call_groq_structured(
    api_key: str,
    model: str,
    prompt: str,
    response_schema: type[T],
) -> T:
    """Call Groq OpenAI-compatible chat completions endpoint with JSON mode."""
    schema_json = json.dumps(response_schema.model_json_schema())
    resp = httpx.post(
        GROQ_ENDPOINT,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are an industrial engineering verification assistant. "
                        "Respond ONLY with valid JSON matching this exact JSON Schema:\n"
                        f"{schema_json}"
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        },
        timeout=GROQ_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    payload = resp.json()
    content = payload["choices"][0]["message"]["content"]
    return response_schema.model_validate_json(_strip_code_fences(content))


def generate_structured(
    prompt: str, response_schema: type[T], stage_name: str
) -> tuple[T, dict[str, Any]]:
    """Call Gemini (3 keys) -> Groq (3 keys) with fast timeouts, raising AIAgentsInaccessibleError if all fail."""
    gemini_keys = get_configured_keys()
    groq_keys = get_configured_groq_keys()

    if not gemini_keys and not groq_keys:
        raise AIAgentsInaccessibleError(
            stage_name,
            ["No Gemini or Groq API keys configured in GEMINI_API_KEYS or GROQ_API_KEYS"],
        )

    failures: list[str] = []
    attempts = 0

    # Tier 1: Gemini Keys #1..#3 (8s timeout)
    configured_gemini_model = get_model_name()
    effective_gemini_model = _RETIRED_MODEL_REDIRECT.get(
        configured_gemini_model, configured_gemini_model
    )

    for idx, key in enumerate(gemini_keys, start=1):
        attempts += 1
        key_slot = f"Gemini Key #{idx}"
        try:
            client = _build_gemini_client(key)
            try:
                parsed_obj = _call_model_with_schema_fallback(
                    client, effective_gemini_model, prompt, response_schema
                )
                used_model = effective_gemini_model
            except Exception as model_exc:  # noqa: BLE001
                err_lower = str(model_exc).lower()
                is_retired_404 = "404" in err_lower or "not_found" in err_lower
                if not is_retired_404:
                    raise
                parsed_obj = None
                used_model = effective_gemini_model
                last_model_exc: Exception = model_exc
                for fallback_model in FALLBACK_GEMINI_MODELS:
                    if fallback_model == effective_gemini_model:
                        continue
                    try:
                        parsed_obj = _call_model_with_schema_fallback(
                            client, fallback_model, prompt, response_schema
                        )
                        used_model = fallback_model
                        _RETIRED_MODEL_REDIRECT[configured_gemini_model] = fallback_model
                        break
                    except Exception as fb_exc:  # noqa: BLE001
                        last_model_exc = fb_exc
                if parsed_obj is None:
                    raise last_model_exc

            return parsed_obj, {
                "mode": "LIVE_GEMINI",
                "provider": "Gemini",
                "key_slot": key_slot,
                "model": used_model,
                "attempts": attempts,
                "stage_name": stage_name,
                "failures": failures,
            }
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{key_slot} failed ({type(exc).__name__}: {exc})")
            if _is_network_or_timeout_error(exc):
                # Global/network timeout on Gemini: fail over straight to Groq.
                break

    # Tier 2: Groq Keys #1..#3 (10s timeout)
    primary_groq_model = get_groq_model_name()
    effective_groq_model = _RETIRED_MODEL_REDIRECT.get(
        primary_groq_model, primary_groq_model
    )
    groq_models_to_try = [effective_groq_model] + [
        m for m in FALLBACK_GROQ_MODELS if m != effective_groq_model
    ]

    for idx, key in enumerate(groq_keys, start=1):
        attempts += 1
        key_slot = f"Groq Key #{idx}"
        try:
            parsed_obj = None
            used_model = effective_groq_model
            last_groq_exc: Exception | None = None

            for candidate_model in groq_models_to_try:
                try:
                    parsed_obj = _call_groq_structured(
                        key, candidate_model, prompt, response_schema
                    )
                    used_model = candidate_model
                    if candidate_model != primary_groq_model:
                        _RETIRED_MODEL_REDIRECT[primary_groq_model] = candidate_model
                    break
                except httpx.HTTPStatusError as http_exc:
                    last_groq_exc = http_exc
                    status_code = http_exc.response.status_code
                    # Retry secondary Groq model on 404/400 model errors; fail over key on 401/429/5xx
                    if status_code not in (400, 404):
                        raise
                except Exception as inner_exc:  # noqa: BLE001
                    last_groq_exc = inner_exc
                    raise

            if parsed_obj is None:
                raise last_groq_exc or RuntimeError("Groq returned empty output")

            return parsed_obj, {
                "mode": "LIVE_GROQ",
                "provider": "Groq",
                "key_slot": key_slot,
                "model": used_model,
                "attempts": attempts,
                "stage_name": stage_name,
                "failures": failures,
            }
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{key_slot} failed ({type(exc).__name__}: {exc})")

    raise AIAgentsInaccessibleError(stage_name, failures)
