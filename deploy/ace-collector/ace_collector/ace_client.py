"""Reusable ACE HTTP client: login + navigation + raw report fetching.

Designed so future jobs (e.g. jobs/player_statistics.py) can reuse the very
same authenticated session without duplicating login logic.
"""
from __future__ import annotations

import logging
import urllib3

import requests

from .config import Config

logger = logging.getLogger("ace-collector")

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

USER_AGENT = "ACE-Collector/1.0 (+casinosystem.app)"


class AceError(RuntimeError):
    pass


class AceClient:
    """Authenticated session against a local ACE casino server."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.base = cfg.ace_base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = cfg.ace_verify_tls
        self.session.headers.update({"User-Agent": USER_AGENT})
        self._logged_in = False

    # ---------------------------------------------------------------- helpers
    def url(self, path: str) -> str:
        return f"{self.base}/{path.lstrip('/')}"

    def _post(self, path: str, data: dict) -> requests.Response:
        resp = self.session.post(
            self.url(path), data=data, timeout=self.cfg.http_timeout, allow_redirects=True
        )
        resp.raise_for_status()
        return resp

    def _get(self, path: str, params: dict | None = None) -> requests.Response:
        resp = self.session.get(
            self.url(path), params=params, timeout=self.cfg.http_timeout, allow_redirects=True
        )
        resp.raise_for_status()
        return resp

    # ------------------------------------------------------------------ login
    def login(self) -> None:
        if self._logged_in:
            return
        # Prime cookies.
        try:
            self._get("/login.php")
        except requests.RequestException as exc:
            raise AceError(f"ACE unreachable at {self.base}: {exc}") from exc

        payload = {
            "login": self.cfg.ace_username,
            "password": self.cfg.ace_password,
            "text_uid": "",
            "select_lang": "1",
            "lang_name": "1",
        }
        resp = self._post("/login.php", payload)
        body = resp.text.lower()
        if "login.php" in resp.url and ("password" in body and "logout" not in body):
            raise AceError("ACE login failed — check ACE_USERNAME / ACE_PASSWORD")
        self._logged_in = True
        logger.debug("ACE login OK as %s", self.cfg.ace_username)

    # -------------------------------------------------------------- managers
    def enter_manager_finance(self) -> None:
        """Emulate Manager -> Finance menu selection."""
        self.login()
        self._post(
            "/users/manager/manager.php",
            {"form_manager_name": "", "button_current_control": ""},
        )
        logger.debug("Manager -> Finance context entered")

    # --------------------------------------------------------------- reports
    def consolidation_html(self, period_id: int) -> str:
        """Fetch the Finance consolidation report HTML for a period."""
        self.enter_manager_finance()
        payload = {
            "class_report": "Report_Current",
            "type_report": "report_consolidation",
            "period_id": str(period_id),
            "p": "1",
            "table": "",
            "maxRow": "30",
            "order": "",
            "order_dir": "",
        }
        resp = self._post("/users/manager/report_c.php", payload)
        return resp.text

    def report_page_html(self) -> str:
        """Raw Finance report page (used to discover available periods)."""
        self.enter_manager_finance()
        return self._get("/users/manager/report_c.php").text
