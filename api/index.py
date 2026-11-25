"""Vercel Python Serverless Function entrypoint for ReconcileGraph FastAPI backend."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.main import app  # noqa: E402, F401
