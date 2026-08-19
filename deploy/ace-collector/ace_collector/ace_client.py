"""Reusable ACE HTTP client: login + navigation + raw report fetching.

Designed so future jobs (e.g. jobs/player_statistics.py) can reuse the very
same authenticated session without duplicating login logic.
"""
from __future__ import annotations

import json
import logging
import os
import urllib3

import requests
from bs4 import BeautifulSoup

from .config import Config

logger = logging.getLogger("ace-collector")

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

USER_AGENT = "ACE-Collector/1.0 (+casinosystem.app)"

DEFAULT_SESSION_FILE = os.environ.get(
    "ACE_SESSION_FILE", "/opt/ace-collector/.ace-session.json"
)


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
        self.session_file = DEFAULT_SESSION_FILE
        self._load_cookies()

    # -------------------------------------------------------- session caching
    def _load_cookies(self) -> None:
        """Reuse the ACE session cookies from the previous run (no re-login)."""
        try:
            with open(self.session_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            cookies = data.get("cookies") or {}
            if not cookies:
                return
            for name, value in cookies.items():
                self.session.cookies.set(name, value)
            self._logged_in = True
            logger.debug("Reused cached ACE session from %s", self.session_file)
        except (OSError, ValueError):
            pass

    def _save_cookies(self) -> None:
        try:
            payload = {"cookies": requests.utils.dict_from_cookiejar(self.session.cookies)}
            tmp = f"{self.session_file}.tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            os.chmod(tmp, 0o600)
            os.replace(tmp, self.session_file)
        except OSError as exc:
            logger.debug("Could not persist ACE session cookies: %s", exc)

    def _drop_cached_session(self) -> None:
        self._logged_in = False
        self.session.cookies.clear()
        try:
            os.remove(self.session_file)
        except OSError:
            pass

    @staticmethod
    def _looks_logged_out(html: str) -> bool:
        """ACE bounces expired sessions back to the login form."""
        return 'name="password"' in html and "form_manager_name" not in html

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
    @staticmethod
    def _parse_hidden_uid(html: str) -> str:
        """Extract the dynamic hidden `text_uid` value from the ACE login form."""
        soup = BeautifulSoup(html, "html.parser")
        field = soup.find("input", attrs={"name": "text_uid"})
        if field is None:
            return ""
        return (field.get("value") or "").strip()

    def login(self, force: bool = False) -> None:
        if self._logged_in and not force:
            return
        # Prime cookies and read the dynamic hidden UID.
        try:
            page = self._get("/login.php")
        except requests.RequestException as exc:
            raise AceError(f"ACE unreachable at {self.base}: {exc}") from exc

        text_uid = self._parse_hidden_uid(page.text)
        if not text_uid:
            logger.warning("Hidden text_uid not found on /login.php — sending empty value")

        payload = {
            "form_login_name": "",
            "login": self.cfg.ace_username,
            "password": self.cfg.ace_password,
            "text_uid": text_uid,
            "select_lang": "1",
            "lang_name": "1",
            "lang_old_name": "1",
            "role_name": "",
            "button_ok": "",
        }
        resp = self._post("/login.php", payload)
        if "form_manager_name" not in resp.text:
            raise AceError("ACE login failed — check ACE_USERNAME / ACE_PASSWORD")
        self._logged_in = True
        self._save_cookies()
        logger.debug("ACE login OK as %s", self.cfg.ace_username)

    # -------------------------------------------------------------- managers
    def enter_manager_finance(self) -> str:
        """Emulate Manager -> Finance menu selection (re-login if session died)."""
        self.login()
        resp = self._post(
            "/users/manager/manager.php",
            {"form_manager_name": "", "button_current_control": ""},
        )
        if self._looks_logged_out(resp.text):
            logger.debug("Cached ACE session expired — re-authenticating")
            self._drop_cached_session()
            self.login(force=True)
            resp = self._post(
                "/users/manager/manager.php",
                {"form_manager_name": "", "button_current_control": ""},
            )
        logger.debug("Manager -> Finance context entered")
        return resp.text

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
        self._save_cookies()
        return resp.text

    def report_page_html(self) -> str:
        """Raw Finance report page (used to discover available periods)."""
        self.enter_manager_finance()
        html = self._get("/users/manager/report_c.php").text
        self._save_cookies()
        return html
