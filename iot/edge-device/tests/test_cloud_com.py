"""
Tests for how cloud-com.py handles an upload Supabase turns down. No network: the HTTP session
is swapped for a fake edge-com that answers each POST.

Run from the repo root (needs Python 3.11 or later for tomllib, and requests):
    uv run --python 3.12 --with requests python -m unittest discover -s iot/edge-device/tests -v
"""

from __future__ import annotations

import gzip
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

EDGE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(EDGE_DIR))

import edge_db as db  # noqa: E402

# cloud-com.py has a dash in its name, so it can't be imported the usual way.
_spec = importlib.util.spec_from_file_location("cloud_com", EDGE_DIR / "cloud-com.py")
cloud_com = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cloud_com)


class FakeResponse:
    def __init__(self, status_code: int, reply: dict):
        self.status_code = status_code
        self.content = json.dumps(reply).encode()
        self.text = self.content.decode()

    def json(self):
        return json.loads(self.content)


class FakeEdgeCom:
    """Stands in for requests.Session. answer(seqs) gives (status, reply) for the readings sent."""

    def __init__(self, answer):
        self.answer = answer
        self.sent = []          # the seq numbers in each POST, in order

    def post(self, url, data, headers, timeout):
        body = json.loads(gzip.decompress(data))
        seqs = [row[0] for node in body.get("nodes", []) for row in node["rows"]]
        self.sent.append(seqs)
        status, reply = self.answer(seqs)
        return FakeResponse(status, reply)


def too_big_over(limit: int):
    """edge-com answering 413 to any batch with more than `limit` readings."""
    return lambda seqs: (413, {"error": "body larger than 4 MB"}) if len(seqs) > limit else (200, {})


class CloudComTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        cfg = {
            "edge_id": "edge-test",
            "db_path": str(Path(self.tmp.name) / "edge.db"),
            "cloud": {"function_url": "https://example.invalid/functions/v1/edge-com",
                      "edge_key": "k" * 32, "batch_size": 8},
        }
        self.svc = cloud_com.CloudCom(cfg)
        self.addCleanup(self.svc.con.close)

    def add_readings(self, count: int):
        now = db.now_iso()
        cols = ["node_id", "boot_id", "seq", "ts", "ts_source", "received_at"] + db.RAW_FIELDS
        for seq in range(1, count + 1):
            values = ["node-1", 1, seq, now, "edge", now, 25.0, 80, 2000, 4000, 50.0, 50.0, 0, -60, 0]
            self.svc.con.execute(f"INSERT INTO readings ({', '.join(cols)}) "
                                 f"VALUES ({', '.join('?' * len(cols))})", values)

    def use(self, answer) -> FakeEdgeCom:
        fake = FakeEdgeCom(answer)
        self.svc.http = fake
        return fake

    def sent_seqs(self) -> list[int]:
        return [r[0] for r in self.svc.con.execute("SELECT seq FROM readings WHERE is_sent = 1 ORDER BY seq")]

    def set_aside(self) -> list[tuple[int, int]]:
        return [(r[0], r[1]) for r in self.svc.con.execute(
            "SELECT r.seq, j.http_status FROM rejected j JOIN readings r ON r.id = j.reading_id ORDER BY r.seq")]


class TooBigTest(CloudComTestCase):
    def test_halves_the_batch_until_it_goes_through(self):
        self.add_readings(10)
        fake = self.use(too_big_over(3))
        with self.assertLogs("cloud-com", level="INFO") as logs:
            ok, more = self.svc.sync_once()
        self.assertEqual((ok, more), (True, True))
        self.assertEqual([len(s) for s in fake.sent], [8, 4, 2])
        self.assertEqual(self.sent_seqs(), [1, 2])
        self.assertEqual(self.set_aside(), [])
        text = "\n".join(logs.output)
        self.assertIn("Supabase said the batch of 8 readings was too big (HTTP 413). "
                      "Trying again now with 4 readings.", text)
        self.assertIn("back to batches of up to 8 readings", text)

    def test_goes_back_to_the_normal_batch_size_afterwards(self):
        self.add_readings(10)
        self.use(too_big_over(3))
        self.svc.sync_once()
        self.assertEqual(self.svc.batch_size, 8)
        # edge-com takes full batches again, so the next upload sends 8 at once.
        fake = self.use(too_big_over(1000))
        self.svc.sync_once()
        self.assertEqual([len(s) for s in fake.sent], [8])
        self.assertEqual(self.sent_seqs(), list(range(1, 11)))

    def test_sets_aside_one_reading_that_is_still_too_big(self):
        self.add_readings(3)
        fake = self.use(too_big_over(0))
        with self.assertLogs("cloud-com", level="ERROR") as logs:
            ok, more = self.svc.sync_once()
        self.assertEqual((ok, more), (True, False))
        self.assertTrue(self.svc.refused)
        self.assertEqual([len(s) for s in fake.sent], [3, 1])
        self.assertEqual(self.set_aside(), [(1, 413)])
        self.assertEqual(self.sent_seqs(), [])
        self.assertIn("Set aside 1 readings", "\n".join(logs.output))
        self.assertEqual(self.svc.batch_size, 8)

    def test_one_huge_reading_does_not_hold_up_the_rest(self):
        self.add_readings(12)
        # Reading 5 is too big on its own; everything else fits.
        self.use(lambda seqs: (413, {"error": "too big"}) if 5 in seqs else (200, {}))
        for _ in range(10):
            self.svc.sync_once()
        self.assertEqual(self.set_aside(), [(5, 413)])
        self.assertEqual(self.sent_seqs(), [s for s in range(1, 13) if s != 5])


class RefusedTest(CloudComTestCase):
    def test_a_malformed_batch_is_set_aside_whole_without_halving(self):
        self.add_readings(5)
        fake = self.use(lambda seqs: (400, {"error": "bad row"}))
        with self.assertLogs("cloud-com", level="ERROR"):
            ok, more = self.svc.sync_once()
        self.assertEqual((ok, more), (True, False))
        self.assertEqual([len(s) for s in fake.sent], [5])
        self.assertEqual(self.set_aside(), [(s, 400) for s in range(1, 6)])

    def test_other_errors_keep_the_batch_for_later(self):
        self.add_readings(5)
        fake = self.use(lambda seqs: (500, {"error": "server error"}))
        with self.assertLogs("cloud-com", level="ERROR"):
            ok, more = self.svc.sync_once()
        self.assertEqual((ok, more), (False, False))
        self.assertEqual([len(s) for s in fake.sent], [5])
        self.assertEqual(self.set_aside(), [])
        self.assertEqual(self.sent_seqs(), [])


if __name__ == "__main__":
    unittest.main()
