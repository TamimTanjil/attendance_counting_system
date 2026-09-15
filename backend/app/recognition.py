"""Face detection + recognition.

Uses InsightFace (buffalo_l: RetinaFace detector + ArcFace embeddings) when it is
installed. If it is not, the module degrades to OpenCV Haar-cascade detection:
faces are still boxed and streamed, but nobody is identified. Check
`/api/health` to see which mode is active.
"""

from __future__ import annotations

import threading

import cv2
import numpy as np

_lock = threading.Lock()
_app = None
_mode = "unavailable"
MODEL_VERSION = "none"


def _init() -> None:
    global _app, _mode, MODEL_VERSION
    if _mode != "unavailable":
        return
    try:
        from insightface.app import FaceAnalysis  # type: ignore

        app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=-1, det_size=(640, 640))
        _app = app
        _mode = "insightface"
        MODEL_VERSION = "arcface-r100 (buffalo_l)"
    except Exception:
        _app = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        _mode = "haar"
        MODEL_VERSION = "haar-cascade (detection only)"


def mode() -> str:
    _init()
    return _mode


def recognition_available() -> bool:
    return mode() == "insightface"


class Face:
    """A detected face: pixel box plus an optional 512-d normalised embedding."""

    def __init__(self, box: tuple[int, int, int, int], embedding: np.ndarray | None, score: float):
        self.box = box
        self.embedding = embedding
        self.det_score = score


def detect(frame: np.ndarray) -> list[Face]:
    _init()
    with _lock:
        if _mode == "insightface":
            faces = []
            for f in _app.get(frame):  # type: ignore[union-attr]
                x1, y1, x2, y2 = (int(v) for v in f.bbox)
                emb = np.asarray(f.normed_embedding, dtype=np.float32)
                faces.append(Face((x1, y1, x2 - x1, y2 - y1), emb, float(f.det_score)))
            return faces

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        boxes = _app.detectMultiScale(gray, 1.2, 5, minSize=(60, 60))  # type: ignore[union-attr]
        return [Face((int(x), int(y), int(w), int(h)), None, 0.9) for x, y, w, h in boxes]


def embed_image(image_bytes: bytes) -> np.ndarray | None:
    """Embedding for the largest face in an uploaded enrolment photo."""
    buf = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if frame is None:
        return None
    faces = [f for f in detect(frame) if f.embedding is not None]
    if not faces:
        return None
    biggest = max(faces, key=lambda f: f.box[2] * f.box[3])
    return biggest.embedding


def to_bytes(vec: np.ndarray) -> bytes:
    return np.asarray(vec, dtype=np.float32).tobytes()


def from_bytes(raw: bytes) -> np.ndarray:
    return np.frombuffer(raw, dtype=np.float32)


def match(
    embedding: np.ndarray, gallery: list[tuple[str, np.ndarray]], threshold: float
) -> tuple[str | None, float]:
    """Cosine similarity against every enrolled vector. Returns (user_id, score)."""
    if not gallery:
        return None, 0.0
    mat = np.stack([v for _, v in gallery])
    sims = mat @ embedding / (
        np.linalg.norm(mat, axis=1) * np.linalg.norm(embedding) + 1e-9
    )
    idx = int(np.argmax(sims))
    best = float(sims[idx])
    return (gallery[idx][0] if best >= threshold else None), best


def decode_qr(frame: np.ndarray) -> list[str]:
    """Badge QR codes visible in the frame (OpenCV, no extra dependency)."""
    detector = cv2.QRCodeDetector()
    try:
        ok, texts, _pts, _ = detector.detectAndDecodeMulti(frame)
    except cv2.error:
        return []
    if not ok:
        return []
    return [t for t in texts if t]
