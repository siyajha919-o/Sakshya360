"""Sakshya360 ML service (FastAPI).

  uvicorn app:app --port 8001
"""
import base64
import json
from pathlib import Path
from typing import List, Optional

import joblib
import numpy as np
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

import assign
import attendance_ae as ae
from features import FEATURES, extract, rule_flags

MODEL_DIR = Path(__file__).parent / "model"
if not (MODEL_DIR / "risk.joblib").exists():
    raise SystemExit("Models not trained – run `python train.py`")

RISK = joblib.load(MODEL_DIR / "risk.joblib")
_ae = torch.load(MODEL_DIR / "attendance_ae.pt", weights_only=True)
AE = ae.AttendanceAE()
AE.load_state_dict(_ae["state_dict"])
AE.eval()
AE_THRESHOLDS = _ae["thresholds"]
METRICS = json.loads((MODEL_DIR / "metrics.json").read_text())

# Vision models load lazily so the service still starts if the ONNX files are missing.
_face = _people = None


def face_engine():
    global _face
    if _face is None:
        from vision import FaceEngine
        try:
            _face = FaceEngine()
        except FileNotFoundError as e:
            raise HTTPException(503, str(e))
    return _face


def people_counter():
    global _people
    if _people is None:
        from vision import PeopleCounter
        _people = PeopleCounter()
    return _people


app = FastAPI(title="Sakshya360 ML", version="2.0")


# ---------- schemas ----------
class Centre(BaseModel):
    id: str
    attendance: List[int] = Field(..., min_length=7)
    sanctioned: int = Field(..., gt=0)
    inspection_days: List[int] = []
    complaints: int = 0
    fund_utilisation: float = 80
    last_inspected_days_ago: int = 30
    cameras_total: int = 4
    cameras_offline: int = 0
    geo_fails: int = 0
    vc_fails: int = 0
    headcount: Optional[int] = None
    register_count: Optional[int] = None


class RiskRequest(BaseModel):
    centres: List[Centre]


class Series(BaseModel):
    id: str
    values: List[int] = Field(..., min_length=7)
    sanctioned: int = Field(..., gt=0)


class AnomalyRequest(BaseModel):
    series: List[Series]


class AProject(BaseModel):
    id: str
    state: str
    risk: float = Field(..., ge=0, le=100)
    days_since_inspection: int = 0


class AInspector(BaseModel):
    id: str
    home_state: str
    capacity: int = Field(..., ge=0)
    visited: List[str] = []


class ADistance(BaseModel):
    inspector_id: str
    project_id: str
    km: float


class StreamRequest(BaseModel):
    url: str
    include_frame: bool = False


class AssignRequest(BaseModel):
    seed: int
    count: int = Field(..., ge=1, le=100)
    projects: List[AProject]
    inspectors: List[AInspector]
    distance_km: List[ADistance] = []


# ---------- endpoints ----------
@app.get("/health")
def health():
    from vision import SFACE, YUNET
    return {
        "ok": True,
        "risk_roc_auc": METRICS["risk_classifier"]["roc_auc"],
        "autoencoder_roc_auc": METRICS["attendance_autoencoder"]["roc_auc"],
        "face_models": YUNET.exists() and SFACE.exists(),
    }


@app.get("/models/metrics")
def metrics():
    return METRICS


@app.post("/risk/score")
def risk_score(req: RiskRequest):
    out = []
    for c in req.centres:
        d = c.model_dump()
        f = extract(d)
        prob = float(RISK["clf"].predict_proba(f[None])[0, 1])
        lo, hi = RISK["iso_range"]
        novelty = float(np.clip((-RISK["iso"].score_samples(f[None])[0] - lo) / (hi - lo), 0, 1))
        risk = round(100 * (0.8 * prob + 0.2 * novelty))
        dev = np.abs(f - RISK["median"]) / (np.abs(RISK["median"]) + 0.1)
        contrib = dev * RISK["clf"].feature_importances_
        drivers = [{"feature": FEATURES[i], "value": round(float(f[i]), 3), "weight": round(float(contrib[i]), 3)}
                   for i in np.argsort(-contrib)[:4] if contrib[i] > 0.001]
        out.append({
            "id": c.id, "risk": risk, "probability": round(prob, 4), "novelty": round(novelty, 4),
            "band": "high" if risk >= 60 else "medium" if risk >= 30 else "low",
            "flags": rule_flags(d, f), "drivers": drivers,
        })
    return out


@app.post("/anomaly/attendance")
def attendance_anomaly(req: AnomalyRequest):
    return [{"id": s.id, **ae.score(AE, AE_THRESHOLDS, s.values, s.sanctioned)} for s in req.series]


@app.post("/assign/optimize")
def assign_optimize(req: AssignRequest):
    if not req.projects or not req.inspectors:
        raise HTTPException(400, "projects and inspectors required")
    return assign.optimise(
        [p.model_dump() for p in req.projects], [i.model_dump() for i in req.inspectors],
        [d.model_dump() for d in req.distance_km], req.count, req.seed)


async def read_image(f: UploadFile) -> bytes:
    data = await f.read()
    if not data:
        raise HTTPException(400, "empty image")
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "image too large")
    return data


@app.post("/face/embed")
async def face_embed(image: UploadFile = File(...)):
    try:
        return face_engine().embed(await read_image(image))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/face/verify")
async def face_verify(image: UploadFile = File(...), reference: str = Form(...)):
    try:
        ref = json.loads(reference)
        if not isinstance(ref, list) or len(ref) != 128:
            raise ValueError("reference must be a 128-d embedding")
        return face_engine().verify(await read_image(image), ref)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/vision/people-count")
async def people_count(image: UploadFile = File(...)):
    try:
        return people_counter().count(await read_image(image))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/vision/stream-count")
def stream_count(req: StreamRequest):
    """Automatic CCTV check: grab a live frame from RTSP and count people (sync def → runs in a worker thread)."""
    import cv2
    from vision import grab_frame
    try:
        frame = grab_frame(req.url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except ConnectionError as e:
        raise HTTPException(502, str(e))
    counter = people_counter()
    out = counter.count_image(frame)
    if req.include_frame:
        ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        out["jpeg_b64"] = base64.b64encode(jpg.tobytes()).decode() if ok else None
    return out
