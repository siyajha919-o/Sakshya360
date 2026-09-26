"""Trains all Sakshya360 models and writes model/metrics.json.

  1. GradientBoostingClassifier (scikit-learn) – supervised P(malpractice)
  2. IsolationForest (scikit-learn)            – unsupervised novelty on engineered features
  3. Conv1d autoencoder (PyTorch)              – unsupervised anomaly on the raw attendance sequence

Data: synthetic centres (synth.py) plus, optionally, real labelled snapshots exported from the API
(GET /api/analytics/training-export, one JSON object per line with label "genuine" | "malpractice"):

  python train.py                                  # synthetic only
  python train.py --real labelled.jsonl            # synthetic + real (real rows weighted higher)
  python train.py --real labelled.jsonl --real-only
"""
import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import torch
from sklearn.ensemble import GradientBoostingClassifier, IsolationForest
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split

import attendance_ae as ae
from features import FEATURES, extract
from synth import FRAUD_TYPES, generate

OUT = Path(__file__).parent / "model"


def load_real(path):
    rows = []
    for n, line in enumerate(Path(path).read_text().splitlines(), 1):
        if not line.strip():
            continue
        c = json.loads(line)
        if c.get("label") not in ("genuine", "malpractice") or len(c.get("attendance", [])) < 7 or not c.get("sanctioned"):
            raise SystemExit(f"{path}:{n}: needs attendance (>= 7 days), sanctioned and label genuine|malpractice")
        c["source"] = "real"
        rows.append(c)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--real", help="JSONL of labelled real centres (from /api/analytics/training-export)")
    ap.add_argument("--real-only", action="store_true", help="train on the real data only")
    ap.add_argument("--real-weight", type=float, default=5.0, help="sample weight of real rows vs synthetic")
    args = ap.parse_args()

    real = load_real(args.real) if args.real else []
    if args.real_only and len(real) < 50:
        raise SystemExit(f"--real-only needs at least 50 labelled centres (got {len(real)})")
    data = ([] if args.real_only else generate()) + real
    X = np.stack([extract(c) for c in data])
    y = np.array([c["label"] != "genuine" for c in data], dtype=int)
    labels = np.array([c["label"] for c in data])
    is_real = np.array([c.get("source") == "real" for c in data])
    idx_tr, idx_te = train_test_split(np.arange(len(data)), test_size=0.25, random_state=7, stratify=y)
    Xtr, Xte, ytr, yte = X[idx_tr], X[idx_te], y[idx_tr], y[idx_te]
    weights = np.where(is_real[idx_tr], args.real_weight, 1.0)

    # --- risk classifier + isolation forest ---
    clf = GradientBoostingClassifier(n_estimators=250, max_depth=3, learning_rate=0.05, random_state=7).fit(Xtr, ytr, sample_weight=weights)
    proba = clf.predict_proba(Xte)[:, 1]
    iso = IsolationForest(n_estimators=300, contamination=0.05, random_state=7).fit(Xtr[ytr == 0])
    raw = -iso.score_samples(Xtr[ytr == 0])
    iso_range = (float(np.percentile(raw, 5)), float(np.percentile(raw, 99)))

    # --- attendance autoencoder (genuine training sequences only) ---
    seqs = [ae.prepare(c["attendance"], c["sanctioned"])[0] for c in data]
    model, thresholds = ae.train([seqs[i] for i in idx_tr if y[i] == 0])
    ae_scores = np.array([ae.score(model, thresholds, data[i]["attendance"], data[i]["sanctioned"])["sequence_score"] for i in idx_te])

    per_type = {}
    for t in FRAUD_TYPES:
        m = (labels[idx_te] == t) | (labels[idx_te] == "genuine")
        if (labels[idx_te][m] == t).sum() == 0:
            continue
        yt = (labels[idx_te][m] == t).astype(int)
        per_type[t] = {
            "classifier_auc": round(float(roc_auc_score(yt, proba[m])), 4),
            "autoencoder_auc": round(float(roc_auc_score(yt, ae_scores[m])), 4),
        }

    real_te = is_real[idx_te]
    metrics = {
        "samples": len(data),
        "test_samples": len(idx_te),
        "data": {
            "synthetic": int((~is_real).sum()),
            "real": int(is_real.sum()),
            "real_test_roc_auc": round(float(roc_auc_score(yte[real_te], proba[real_te])), 4)
            if real_te.sum() >= 10 and len(set(yte[real_te])) == 2 else None,
        },
        "risk_classifier": {
            "algorithm": "GradientBoostingClassifier",
            "roc_auc": round(float(roc_auc_score(yte, proba)), 4),
            "report": classification_report(yte, proba > 0.5, target_names=["genuine", "malpractice"], output_dict=True),
            "feature_importance": dict(sorted(zip(FEATURES, map(float, clf.feature_importances_)), key=lambda kv: -kv[1])),
        },
        "attendance_autoencoder": {
            "algorithm": "PyTorch Conv1d autoencoder (6-d bottleneck, two-sided residual score)",
            "roc_auc": round(float(roc_auc_score(yte, ae_scores)), 4),
            "thresholds": thresholds,
        },
        "per_fraud_type": per_type,
    }

    OUT.mkdir(exist_ok=True)
    joblib.dump({"clf": clf, "iso": iso, "iso_range": iso_range, "features": FEATURES, "median": np.median(Xtr[ytr == 0], axis=0)},
                OUT / "risk.joblib")
    torch.save({"state_dict": model.state_dict(), "thresholds": thresholds}, OUT / "attendance_ae.pt")
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=2))

    print(f"Data              {metrics['data']}")
    print(f"Risk classifier   ROC-AUC {metrics['risk_classifier']['roc_auc']}")
    print(classification_report(yte, proba > 0.5, target_names=["genuine", "malpractice"]))
    print(f"Autoencoder       ROC-AUC {metrics['attendance_autoencoder']['roc_auc']}")
    for t, v in per_type.items():
        print(f"  {t:22s} classifier {v['classifier_auc']:.3f}   autoencoder {v['autoencoder_auc']:.3f}")


if __name__ == "__main__":
    main()
