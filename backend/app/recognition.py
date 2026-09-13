"""Face detection + LBPH recognition + QR code decoding (OpenCV only)."""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from . import db
from .config import FACES_DIR, MODEL_PATH

FACE_SIZE = (200, 200)


def _cascade() -> cv2.CascadeClassifier:
    path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
    return cv2.CascadeClassifier(str(path))


class Recognizer:
    """Detects faces and QR codes and maps them to enrolled students."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cascade = _cascade()
        self._qr = cv2.QRCodeDetector()
        self._model: Any | None = None
        self._trained = False
        self.load()

    # ------------------------------ training ------------------------------ #
    def _new_model(self) -> Any:
        if not hasattr(cv2, "face"):
            raise RuntimeError(
                "opencv-contrib-python is required for LBPH face recognition"
            )
        return cv2.face.LBPHFaceRecognizer_create(radius=1, neighbors=8, grid_x=8, grid_y=8)

    def load(self) -> None:
        if MODEL_PATH.exists():
            try:
                model = self._new_model()
                model.read(str(MODEL_PATH))
                with self._lock:
                    self._model, self._trained = model, True
                return
            except Exception:  # noqa: BLE001 - corrupt model: retrain instead
                MODEL_PATH.unlink(missing_ok=True)
        with self._lock:
            self._model, self._trained = None, False

    def train(self) -> int:
        """Rebuild the LBPH model from every enrolled photo on disk."""
        samples: list[np.ndarray] = []
        labels: list[int] = []
        for label, user_id in db.labelled_users():
            folder = FACES_DIR / user_id
            if not folder.is_dir():
                continue
            for file in sorted(folder.glob("*.png")):
                img = cv2.imread(str(file), cv2.IMREAD_GRAYSCALE)
                if img is None:
                    continue
                samples.append(cv2.resize(img, FACE_SIZE))
                labels.append(label)

        if not samples:
            MODEL_PATH.unlink(missing_ok=True)
            with self._lock:
                self._model, self._trained = None, False
            return 0

        model = self._new_model()
        model.train(samples, np.array(labels))
        model.write(str(MODEL_PATH))
        with self._lock:
            self._model, self._trained = model, True
        return len(samples)

    # ------------------------------ enrolment ----------------------------- #
    def extract_face(self, image_bytes: bytes) -> np.ndarray | None:
        buf = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if frame is None:
            return None
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        faces = self._cascade.detectMultiScale(gray, 1.15, 5, minSize=(80, 80))
        if len(faces) == 0:
            return cv2.resize(gray, FACE_SIZE)
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        return cv2.resize(gray[y : y + h, x : x + w], FACE_SIZE)

    def save_sample(self, user_id: str, index: int, face: np.ndarray) -> Path:
        folder = FACES_DIR / user_id
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{index:02d}.png"
        cv2.imwrite(str(path), face)
        return path

    # ------------------------------ inference ----------------------------- #
    def detect(self, frame: np.ndarray, threshold: float) -> list[dict[str, Any]]:
        """Return normalised (0-100%) boxes for faces and QR codes in the frame."""
        height, width = frame.shape[:2]
        gray = cv2.equalizeHist(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
        results: list[dict[str, Any]] = []

        faces = self._cascade.detectMultiScale(gray, 1.15, 5, minSize=(60, 60))
        for i, (x, y, w, h) in enumerate(faces):
            name, confidence, student_id = "Unknown", 0.0, None
            with self._lock:
                model, trained = self._model, self._trained
            if trained and model is not None:
                label, distance = model.predict(cv2.resize(gray[y : y + h, x : x + w], FACE_SIZE))
                # LBPH distance: lower is better. Map ~0..120 onto 1..0.
                confidence = max(0.0, min(1.0, 1.0 - float(distance) / 120.0))
                user = db.get_user_by_label(int(label))
                if user and confidence >= threshold:
                    name, student_id = user["name"], user["studentId"]
            results.append(
                {
                    "id": f"f{i}",
                    "kind": "face",
                    "name": name,
                    "studentId": student_id,
                    "confidence": round(confidence, 3),
                    "known": student_id is not None,
                    "x": round(x / width * 100, 2),
                    "y": round(y / height * 100, 2),
                    "w": round(w / width * 100, 2),
                    "h": round(h / height * 100, 2),
                }
            )

        results.extend(self.detect_qr(frame, width, height))
        return results

    def detect_qr(self, frame: np.ndarray, width: int, height: int) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        try:
            ok, texts, points, _ = self._qr.detectAndDecodeMulti(frame)
        except cv2.error:
            return out
        if not ok or points is None:
            return out
        for i, (text, quad) in enumerate(zip(texts, points)):
            text = (text or "").strip()
            xs, ys = quad[:, 0], quad[:, 1]
            user = db.get_user_by_student_id(text) if text else None
            out.append(
                {
                    "id": f"q{i}",
                    "kind": "qr",
                    "name": user["name"] if user else (text or "QR"),
                    "studentId": user["studentId"] if user else None,
                    "confidence": 1.0 if user else 0.0,
                    "known": user is not None,
                    "x": round(float(xs.min()) / width * 100, 2),
                    "y": round(float(ys.min()) / height * 100, 2),
                    "w": round(float(xs.max() - xs.min()) / width * 100, 2),
                    "h": round(float(ys.max() - ys.min()) / height * 100, 2),
                }
            )
        return out


recognizer = Recognizer()
