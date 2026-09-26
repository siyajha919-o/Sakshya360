"""Unit tests for the ML service: features, rule flags, assignment constraints, autoencoder, API.

  .venv/bin/python -m unittest discover -s tests -v
"""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import assign  # noqa: E402
from features import FEATURES, extract, rule_flags  # noqa: E402


def centre(attendance, **kw):
    c = dict(attendance=attendance, sanctioned=40, inspection_days=[], complaints=0, fund_utilisation=80,
             last_inspected_days_ago=10, cameras_total=4, cameras_offline=0, geo_fails=0, vc_fails=0)
    c.update(kw)
    return c


class Features(unittest.TestCase):
    def test_vector_length_matches_names(self):
        rng = np.random.default_rng(1)
        f = extract(centre(list(rng.integers(25, 35, 30))))
        self.assertEqual(len(f), len(FEATURES))
        self.assertTrue(np.isfinite(f).all())

    def test_flat_register_flagged(self):
        c = centre([40] * 30)
        codes = {x["code"] for x in rule_flags(c, extract(c))}
        self.assertIn("PROXY_REGISTER", codes)

    def test_inspection_spike_flagged(self):
        a = [18] * 30
        a[29 - 3] = 40
        c = centre(a, inspection_days=[3])
        codes = {x["code"] for x in rule_flags(c, extract(c))}
        self.assertIn("INSPECTION_DAY_SPIKE", codes)

    def test_over_capacity_flagged(self):
        c = centre([30] * 20 + [46] * 10)
        codes = {x["code"] for x in rule_flags(c, extract(c))}
        self.assertIn("OVER_CAPACITY", codes)

    def test_headcount_gap(self):
        c = centre([30] * 30, headcount=10, register_count=30)
        self.assertAlmostEqual(extract(c)[FEATURES.index("headcount_gap")], 2 / 3, places=3)


class Assignment(unittest.TestCase):
    projects = [{"id": f"P{i}", "state": s, "risk": r, "days_since_inspection": 30}
                for i, (s, r) in enumerate([("UP", 90), ("Bihar", 10), ("MP", 50), ("UP", 70)])]
    inspectors = [{"id": "I1", "home_state": "UP", "capacity": 2, "visited": []},
                  {"id": "I2", "home_state": "Bihar", "capacity": 1, "visited": ["P2"]}]

    def run_solver(self, count=3, seed=42):
        return assign.optimise(self.projects, self.inspectors, [], count, seed)

    def test_hard_constraints(self):
        out = self.run_solver()
        home = {i["id"]: i["home_state"] for i in self.inspectors}
        state = {p["id"]: p["state"] for p in self.projects}
        load = {}
        for a in out["assignments"]:
            self.assertNotEqual(home[a["inspector_id"]], state[a["project_id"]], "conflict of interest")
            self.assertFalse(a["inspector_id"] == "I2" and a["project_id"] == "P2", "rotation")
            load[a["inspector_id"]] = load.get(a["inspector_id"], 0) + 1
        self.assertLessEqual(load.get("I1", 0), 2)
        self.assertLessEqual(load.get("I2", 0), 1)
        self.assertEqual(len({a["project_id"] for a in out["assignments"]}), len(out["assignments"]))

    def test_same_seed_is_replayable(self):
        self.assertEqual(self.run_solver(seed=7)["assignments"], self.run_solver(seed=7)["assignments"])


class Autoencoder(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import torch
        import attendance_ae as ae
        d = torch.load(Path(__file__).resolve().parent.parent / "model" / "attendance_ae.pt", weights_only=True)
        cls.ae, cls.model, cls.th = ae, ae.AttendanceAE(), d["thresholds"]
        cls.model.load_state_dict(d["state_dict"])
        cls.model.eval()

    def score(self, a, cap=40):
        return self.ae.score(self.model, self.th, a, cap)

    def test_genuine_is_normal(self):
        rng = np.random.default_rng(3)
        s = self.score(list(np.round(30 + rng.normal(0, 2, 30)).astype(int)))
        self.assertLess(s["sequence_score"], 1.0)

    def test_copy_paste_register_is_too_regular(self):
        s = self.score([40] * 30)
        self.assertGreater(s["sequence_score"], 1.0)
        self.assertEqual(s["direction"], "too_regular")

    def test_spike_is_irregular_and_located(self):
        rng = np.random.default_rng(4)
        a = list(np.round(18 + rng.normal(0, 1.5, 30)).astype(int))
        a[20] = 40
        s = self.score(a)
        self.assertEqual(s["direction"], "irregular")
        self.assertIn(20, s["anomalous_days"])


class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        import app
        cls.client = TestClient(app.app)

    def test_health(self):
        self.assertTrue(self.client.get("/health").json()["ok"])

    def test_risk_score_shape(self):
        r = self.client.post("/risk/score", json={"centres": [{"id": "X", "attendance": [40] * 30, "sanctioned": 40}]})
        self.assertEqual(r.status_code, 200)
        out = r.json()[0]
        self.assertTrue(0 <= out["risk"] <= 100)
        self.assertIn(out["band"], ["low", "medium", "high"])

    def test_stream_count_rejects_non_rtsp(self):
        r = self.client.post("/vision/stream-count", json={"url": "http://169.254.169.254/latest"})
        self.assertEqual(r.status_code, 400)


if __name__ == "__main__":
    unittest.main()
