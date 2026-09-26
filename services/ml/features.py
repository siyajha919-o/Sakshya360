"""Feature extraction shared by training and inference.

A "centre" is one project/institute snapshot:
  attendance        list[int]  daily count, oldest -> newest (30 days)
  sanctioned        int        sanctioned beneficiary capacity
  inspection_days   list[int]  days-ago on which an inspection happened
  complaints, fund_utilisation, last_inspected_days_ago,
  cameras_total, cameras_offline, geo_fails, vc_fails,
  headcount, register_count  (latest physical inspection, optional)
"""
import numpy as np

FEATURES = [
    "cv",                 # coefficient of variation – near 0 means copy-pasted register
    "occupancy",          # mean attendance / sanctioned
    "over_capacity_frac", # share of days above sanctioned capacity
    "inspection_spike",   # mean on inspection days / mean on other days
    "max_abs_z",          # largest daily z-score
    "unique_ratio",       # distinct values / days
    "round_frac",         # share of counts that are multiples of 5 (fabrication tell)
    "trend",              # normalised slope
    "complaints",
    "fund_utilisation",
    "days_since_inspection",
    "camera_offline_frac",
    "geo_fails",
    "vc_fails",
    "headcount_gap",      # 1 - physically counted / register (0 if not inspected)
]


def extract(c: dict) -> np.ndarray:
    a = np.asarray(c["attendance"], dtype=float)
    n = len(a)
    cap = max(float(c["sanctioned"]), 1.0)
    mean = a.mean() if n else 0.0
    std = a.std() if n else 0.0

    idx = [n - 1 - d for d in c.get("inspection_days", []) if 0 <= d < n]
    mask = np.zeros(n, dtype=bool)
    mask[idx] = True
    if mask.any() and (~mask).any() and a[~mask].mean() > 0:
        spike = a[mask].mean() / a[~mask].mean()
    else:
        spike = 1.0

    slope = np.polyfit(np.arange(n), a, 1)[0] / cap if n > 1 else 0.0
    hc, rc = c.get("headcount"), c.get("register_count")
    gap = max(0.0, 1 - hc / rc) if hc is not None and rc else 0.0

    return np.array([
        std / mean if mean else 0.0,
        mean / cap,
        float((a > cap).mean()),
        spike,
        float(np.abs((a - mean) / std).max()) if std else 0.0,
        len(set(a.tolist())) / n,
        float((a % 5 == 0).mean()),
        slope,
        c.get("complaints", 0),
        c.get("fund_utilisation", 80) / 100,
        min(c.get("last_inspected_days_ago", 30), 365) / 365,
        c.get("cameras_offline", 0) / max(c.get("cameras_total", 1), 1),
        c.get("geo_fails", 0),
        c.get("vc_fails", 0),
        gap,
    ], dtype=float)


def rule_flags(c: dict, f: np.ndarray) -> list:
    """Human-readable explanations that accompany the model score."""
    v = dict(zip(FEATURES, f))
    a, cap = c["attendance"], c["sanctioned"]
    out = []
    if v["cv"] < 0.02:
        out.append(("high", "PROXY_REGISTER", f"Attendance identical ({a[-1]}) for {len(a)} days – likely fabricated register"))
    if v["over_capacity_frac"] > 0:
        out.append(("high", "OVER_CAPACITY", f"{round(v['over_capacity_frac'] * len(a))} days exceed sanctioned capacity ({cap}) – possible ghost beneficiaries"))
    if v["inspection_spike"] > 1.5:
        out.append(("high", "INSPECTION_DAY_SPIKE", f"Attendance {round((v['inspection_spike'] - 1) * 100)}% higher on inspection days – proxy functioning suspected"))
    if v["max_abs_z"] > 2.5:
        out.append(("med", "STAT_OUTLIER", f"Statistical outlier day(s) detected (|z| = {v['max_abs_z']:.1f})"))
    if v["round_frac"] > 0.6 and v["cv"] >= 0.02:
        out.append(("med", "ROUND_NUMBERS", f"{round(v['round_frac'] * 100)}% of counts are multiples of 5"))
    if v["camera_offline_frac"] > 0:
        out.append(("high" if v["camera_offline_frac"] >= 0.5 else "med", "CCTV_OFFLINE", f"{c.get('cameras_offline')}/{c.get('cameras_total')} CCTV cameras offline"))
    if c.get("last_inspected_days_ago", 0) > 90:
        out.append(("med", "NOT_INSPECTED", f"Not inspected for {c['last_inspected_days_ago']} days"))
    if v["geo_fails"]:
        out.append(("high", "GEOFENCE_FAIL", f"{int(v['geo_fails'])} inspection report(s) filed outside site geofence"))
    if v["vc_fails"]:
        out.append(("med", "VC_FAILED", f"{int(v['vc_fails'])} random VC(s) not verified"))
    if v["headcount_gap"] > 0.3:
        out.append(("high", "HEADCOUNT_MISMATCH", f"Physical headcount {round(v['headcount_gap'] * 100)}% below register"))
    return [{"sev": s, "code": k, "text": t} for s, k, t in out]
