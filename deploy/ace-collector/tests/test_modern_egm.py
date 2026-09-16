"""Static tests for the modern ACE EGM source and the /aceapi/ RPC helper."""
from __future__ import annotations

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ace_collector.ace_client import AceClient, AceError  # noqa: E402
from jobs import egm_status  # noqa: E402

MODERN_RESULT = {
    "egms": [
        {
            "leg_id": 1187,
            "leg_num_in_floor": "401",
            "lgs_id": 3,
            "islinked": 1,
        },
        {"leg_id": 1188, "leg_num_in_floor": "402", "lgs_id": 1, "islinked": 0},
        {"leg_id": 1189, "lgs_id": 1},
    ],
    "egmsparams": {"1187": {"gamescnt": 15}},
    "players": {"1187": {"player": "Nurdin Mafie", "ptr_id": 88132}, "1188": {"player": "Anon"}},
    "meters": {"1187": {"etl_denom": 10}, "1188": {"etl_denom": 10}},
    "currentmeters": {
        "1187": {"currentcredits": 2500, "gamename": "Shining Crown"},
        "1188": {"currentcredits": 0, "gamename": "Burning Hot"},
    },
    "sessions": {
        "1187": {"total_in_result": 20000, "games_played": 100},
        "1188": {"total_in_result": 500, "games_played": 0},
    },
    "lastbets": {"1187": {"total_in": 200}, "1189": {"total_in": 999}},
}

EGMS_HTML = """
<table>
  <tr><th>#EGM</th><th>State</th></tr>
  <tr egm="1187"><td>A01</td><td>In Game</td></tr>
</table>
"""


class FakeResponse:
    def __init__(self, payload, status_code=200, text=None):
        self._payload = payload
        self.status_code = status_code
        self.text = text if text is not None else json.dumps(payload)

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload

    def raise_for_status(self):
        pass


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.calls = []
        self.cookies = type("C", (), {"clear": lambda self: None})()
        self.headers = {}
        self.verify = True

    def post(self, url, json=None, headers=None, timeout=None, allow_redirects=None):
        self.calls.append({"url": url, "json": json, "headers": headers})
        return self.response


def _client(response) -> AceClient:
    client = AceClient.__new__(AceClient)
    client.base = "https://ace.local"
    client.cfg = type("Cfg", (), {"http_timeout": 30})()
    client.session = FakeSession(response)
    client._logged_in = True
    client.session_file = "/tmp/.ace-test-session.json"
    return client


class ApiRpcTest(unittest.TestCase):
    def test_request_body_and_result(self):
        client = _client(FakeResponse({"jsonrpc": "2.0", "result": {"egms": []}}))
        client.login = lambda force=False: None
        client._save_cookies = lambda: None
        result = client.api_rpc("egms.getegmlist", {"a": 1})
        call = client.session.calls[0]
        self.assertEqual(call["url"], "https://ace.local/aceapi/")
        self.assertEqual(call["json"]["jsonrpc"], "2.0")
        self.assertEqual(call["json"]["method"], "egms.getegmlist")
        self.assertEqual(call["json"]["params"], {"a": 1})
        self.assertEqual(len(str(call["json"]["id"])), 36)
        self.assertEqual(call["headers"]["Content-Type"], "application/json")
        self.assertEqual(result, {"egms": []})

    def test_error_and_non_json_raise(self):
        client = _client(FakeResponse({"error": {"code": -1, "message": "nope"}}))
        client.login = lambda force=False: None
        client._save_cookies = lambda: None
        with self.assertRaises(AceError):
            client.api_rpc("egms.getegmlist")

        client2 = _client(FakeResponse(None, text="<html>oops</html>"))
        client2.login = lambda force=False: None
        client2._save_cookies = lambda: None
        with self.assertRaises(AceError):
            client2.api_rpc("egms.getegmlist")


class ModernEgmTest(unittest.TestCase):
    def setUp(self):
        self.items = egm_status.normalize_modern(MODERN_RESULT)
        self.by_code = {i["egm_code"]: i for i in self.items}

    def test_rows_and_leg_id_join(self):
        self.assertEqual(len(self.items), 3)
        first = self.by_code["401"]
        self.assertEqual(first["position"], "401")
        self.assertEqual(first["raw_data"]["leg_id"], 1187)
        self.assertEqual(first["raw_data"]["games_count"], 15)
        self.assertEqual(first["state"], "3")  # numeric lgs_id kept raw

    def test_credit_formula_zero_and_missing(self):
        self.assertEqual(self.by_code["401"]["active_credit"], 250.0)
        self.assertEqual(self.by_code["402"]["active_credit"], 0.0)
        self.assertIsNone(self.by_code["1189"]["active_credit"])

    def test_player_display_without_fake_id(self):
        self.assertEqual(self.by_code["401"]["ace_player_id"], "88132")
        self.assertIsNone(self.by_code["402"]["ace_player_id"])
        self.assertEqual(self.by_code["402"]["raw_data"]["player_display"], "Anon")

    def test_game_avg_bet_and_last_bet(self):
        self.assertEqual(self.by_code["401"]["raw_data"]["current_game"], "Shining Crown")
        self.assertEqual(self.by_code["401"]["raw_data"]["average_bet"], 200.0)
        self.assertEqual(self.by_code["402"]["raw_data"]["average_bet"], 0.0)
        self.assertEqual(self.by_code["401"]["raw_data"]["last_bet"], 200.0)
        # no player -> no last bet, even though lastbets has a value
        self.assertIsNone(self.by_code["1189"]["raw_data"]["last_bet"])

    def test_row_without_position_falls_back_to_leg_id(self):
        self.assertIn("1189", self.by_code)
        self.assertIsNone(self.by_code["1189"]["position"])


class FallbackTest(unittest.TestCase):
    def test_modern_failure_uses_html_parser(self):
        class C:
            def api_rpc(self, *_a, **_k):
                raise AceError("boom")

            def manager_page_html(self, _path):
                return EGMS_HTML

        items = egm_status.collect(C())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["egm_code"], "A01")
        self.assertEqual(items[0]["state"], "In Game")


if __name__ == "__main__":
    unittest.main()
