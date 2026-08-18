"""Configuration loading for the ACE Collector.

All secrets come from /etc/ace-collector.env (created by install.sh).
Nothing sensitive is ever hardcoded here.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

ENV_FILE = os.environ.get("ACE_ENV_FILE", "/etc/ace-collector.env")

DEFAULT_ACE_BASE_URL = "https://192.168.1.191"
DEFAULT_API_URL = "https://rpehngjvwcnipvkouluu.supabase.co/functions/v1/ace-finance-ingest"
DEFAULT_TZ = "Africa/Dar_es_Salaam"


def _load_env_file(path: str = ENV_FILE) -> None:
    """Load KEY=VALUE lines from the env file into os.environ (no override)."""
    if not os.path.isfile(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
                val = val[1:-1]
            os.environ.setdefault(key, val)


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Config:
    ace_base_url: str
    ace_username: str
    ace_password: str
    ace_verify_tls: bool
    api_url: str
    api_key: str
    location_code: str
    timezone: str
    closing_window_start: int
    closing_window_end: int
    http_timeout: int

    @classmethod
    def load(cls) -> "Config":
        _load_env_file()
        return cls(
            ace_base_url=os.environ.get("ACE_BASE_URL", DEFAULT_ACE_BASE_URL).rstrip("/"),
            ace_username=os.environ.get("ACE_USERNAME", ""),
            ace_password=os.environ.get("ACE_PASSWORD", ""),
            ace_verify_tls=_bool(os.environ.get("ACE_VERIFY_TLS"), False),
            api_url=os.environ.get("CASINO_API_URL", DEFAULT_API_URL),
            api_key=os.environ.get("ACE_INGEST_KEY", ""),
            location_code=os.environ.get("LOCATION_CODE", "arusha").strip().lower(),
            timezone=os.environ.get("ACE_TZ", DEFAULT_TZ),
            closing_window_start=int(os.environ.get("CLOSING_WINDOW_START", "8")),
            closing_window_end=int(os.environ.get("CLOSING_WINDOW_END", "12")),
            http_timeout=int(os.environ.get("HTTP_TIMEOUT", "60")),
        )

    def validate(self) -> list[str]:
        problems: list[str] = []
        if not self.ace_username:
            problems.append("ACE_USERNAME is empty")
        if not self.ace_password:
            problems.append("ACE_PASSWORD is empty")
        if not self.api_key:
            problems.append("ACE_INGEST_KEY is empty")
        if not self.location_code:
            problems.append("LOCATION_CODE is empty")
        return problems
