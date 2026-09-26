"""Synthetic labelled data for training.

No public dataset exists for DoSJE centre fraud, so we simulate genuine centres and
five known malpractice patterns reported in social-audit findings. Replace with
labelled historical inspection outcomes once available.
"""
import numpy as np

FRAUD_TYPES = ["flat_register", "inspection_spike", "over_report", "ghost_beneficiaries", "round_numbers"]


def centre(rng: np.random.Generator, label: str) -> dict:
    cap = int(rng.choice([25, 30, 40, 50, 60, 100]))
    base = cap * rng.uniform(0.55, 0.92)
    days = 30
    a = base + rng.normal(0, cap * 0.05, days)
    if rng.random() < 0.3:  # genuine seasonal/festival dip
        s = rng.integers(0, days - 5)
        a[s:s + 5] *= rng.uniform(0.6, 0.85)
    insp = sorted(rng.choice(days, size=int(rng.integers(1, 3)), replace=False).tolist())

    fraud = label != "genuine"
    ctx = dict(
        complaints=int(rng.poisson(1.4 if fraud else 1.0)),
        fund_utilisation=float(np.clip(rng.normal(72 if fraud else 79, 15), 20, 100)),
        last_inspected_days_ago=int(rng.integers(0, 180) if fraud else rng.integers(0, 150)),
        cameras_total=4,
        cameras_offline=int(rng.binomial(4, 0.15 if fraud else 0.08)),
        geo_fails=int(rng.random() < (0.08 if fraud else 0.03)),
        vc_fails=int(rng.poisson(0.35 if fraud else 0.15)),
    )

    headcount_ratio = rng.uniform(0.85, 1.05)
    subtle = rng.random() < 0.45  # partial / disguised malpractice
    if label == "flat_register":
        if subtle:  # copy-paste with occasional +/-1 edits
            a[:] = round(base) + rng.choice([-1, 0, 0, 0, 1], days)
        else:
            a[:] = cap if rng.random() < 0.6 else round(base)
        headcount_ratio = rng.uniform(0.3, 0.8)
    elif label == "inspection_spike":
        a *= rng.uniform(0.7, 0.85) if subtle else rng.uniform(0.35, 0.6)
        for d in insp:
            a[days - 1 - d] = cap * rng.uniform(0.85, 1.0)
    elif label == "over_report":
        k = int(rng.integers(1, 4) if subtle else rng.integers(4, 15))
        a[-k:] = cap + rng.integers(1, max(2, cap // 5), k)
    elif label == "ghost_beneficiaries":
        a = cap * rng.uniform(0.92, 1.0) + rng.normal(0, cap * 0.01, days)
        headcount_ratio = rng.uniform(0.55, 0.85) if subtle else rng.uniform(0.35, 0.65)
    elif label == "round_numbers":
        if subtle:
            a = np.where(rng.random(days) < 0.6, np.round(a / 5) * 5, a)
        else:
            a = np.round(a / 5) * 5

    a = np.clip(np.round(a), 0, None).astype(int)
    inspected = rng.random() < 0.6
    reg = int(a[-1])
    return dict(
        attendance=a.tolist(), sanctioned=cap, inspection_days=insp, **ctx,
        headcount=int(reg * headcount_ratio) if inspected else None,
        register_count=reg if inspected else None,
        label=label,
    )


def _flip(rng, label):
    # ~3% label noise: audits miss some fraud and wrongly flag some genuine centres
    if rng.random() < 0.03:
        return "genuine" if label != "genuine" else str(rng.choice(FRAUD_TYPES))
    return label


def generate(n: int = 4000, fraud_rate: float = 0.25, seed: int = 26095) -> list:
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        label = rng.choice(FRAUD_TYPES) if rng.random() < fraud_rate else "genuine"
        c = centre(rng, str(label))
        c["label"] = _flip(rng, c["label"])
        out.append(c)
    return out
