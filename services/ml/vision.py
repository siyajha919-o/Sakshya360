"""OpenCV computer vision: face verification for attendance and person counting for CCTV frames.

Face pipeline: YuNet detector -> align & crop -> SFace 128-d embedding -> cosine similarity.
Models (ONNX, from opencv_zoo) are fetched by download_models.py.
"""
import os
from pathlib import Path
from urllib.parse import urlparse

# RTSP over TCP: reliable through Docker/NAT and on lossy links.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")
import cv2  # noqa: E402
import numpy as np

MODELS = Path(__file__).parent / "models"
YUNET = MODELS / "face_detection_yunet_2023mar.onnx"
SFACE = MODELS / "face_recognition_sface_2021dec.onnx"
COSINE_MATCH = 0.363  # SFace recommended threshold (LFW)


def decode(image_bytes):
    img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    # Phone selfies can be huge; detection works best around 640 px.
    scale = 640 / max(img.shape[:2])
    if scale < 1:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return img


class FaceEngine:
    def __init__(self):
        if not (YUNET.exists() and SFACE.exists()):
            raise FileNotFoundError("Face models missing – run `python download_models.py`")
        self.detector = cv2.FaceDetectorYN.create(str(YUNET), "", (320, 320), score_threshold=0.8)
        self.recognizer = cv2.FaceRecognizerSF.create(str(SFACE), "")

    def detect(self, img):
        h, w = img.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(img)
        return [] if faces is None else list(faces)

    def embed(self, image_bytes):
        img = decode(image_bytes)
        faces = self.detect(img)
        if len(faces) != 1:
            return {"faces": len(faces), "embedding": None}
        aligned = self.recognizer.alignCrop(img, faces[0])
        feat = self.recognizer.feature(aligned).flatten()
        return {"faces": 1, "embedding": [float(v) for v in feat], "confidence": float(faces[0][-1])}

    def verify(self, image_bytes, reference):
        probe = self.embed(image_bytes)
        if probe["embedding"] is None:
            return {"faces": probe["faces"], "match": False, "score": None}
        a = np.asarray(probe["embedding"], dtype=np.float32)[None, :]
        b = np.asarray(reference, dtype=np.float32)[None, :]
        score = float(self.recognizer.match(a, b, cv2.FaceRecognizerSF_FR_COSINE))
        return {"faces": 1, "match": score >= COSINE_MATCH, "score": round(score, 4), "threshold": COSINE_MATCH}


class PeopleCounter:
    """HOG + linear SVM pedestrian detector with non-max suppression.
    Production: swap for a YOLO model running on the stream server for crowded indoor scenes."""

    def __init__(self):
        self.hog = cv2.HOGDescriptor()
        self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def count(self, image_bytes):
        return self.count_image(decode(image_bytes))

    def count_image(self, img):
        scale = 640 / max(img.shape[:2])
        if scale < 1:
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        rects, weights = self.hog.detectMultiScale(img, winStride=(8, 8), padding=(8, 8), scale=1.05)
        boxes, scores = [], []
        for (x, y, w, h), s in zip(rects, np.asarray(weights).flatten()):
            if s > 0.5:
                boxes.append([int(x), int(y), int(w), int(h)])
                scores.append(float(s))
        keep = cv2.dnn.NMSBoxes(boxes, scores, 0.5, 0.4) if boxes else []
        kept = [boxes[i] for i in np.asarray(keep).flatten()]
        return {"count": len(kept), "boxes": kept, "detector": "opencv-hog", "frame": list(img.shape[:2])}


def grab_frame(url, timeout_ms=10000, warmup_frames=8):
    """Pull one decoded frame from an RTSP stream (camera or MediaMTX path)."""
    if urlparse(url).scheme not in ("rtsp", "rtsps"):
        raise ValueError("only rtsp:// stream URLs are accepted")
    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG, [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_ms, cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout_ms])
    try:
        if not cap.isOpened():
            raise ConnectionError(f"cannot open stream {urlparse(url).path}")
        frame = None
        # Skip the first frames: decoders can emit grey frames until the first keyframe arrives.
        for _ in range(warmup_frames):
            ok, f = cap.read()
            if ok:
                frame = f
        if frame is None:
            raise ConnectionError("stream opened but produced no frames")
        return frame
    finally:
        cap.release()
