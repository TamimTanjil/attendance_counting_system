"""Recognition worker + live detections broadcast channel.

A background thread pulls the newest frame from the camera, detects faces,
matches them against the enrolled gallery, writes attendance rows and pushes
`{ detections, checkIn? }` frames to every connected WebSocket client — exactly
the payload `src/hooks/useLiveDetections.ts` expects.
"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any

import numpy as np
from sqlalchemy.orm import Session

from . import recognition
from .attendance import record
from .camera import CameraReader
from .db import SessionLocal
from .models import FaceEmbedding, User
from .settings_store import load as load_settings


class Broadcaster:
    """Fan-out of detection frames to WebSocket clients (thread-safe publish)."""

    def __init__(self) -> None:
        self._clients: set[asyncio.Queue[dict[str, Any]]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=5)
        self._clients.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[dict[str, Any]]) -> None:
        self._clients.discard(q)

    def publish(self, message: dict[str, Any]) -> None:
        if not self._loop or not self._clients:
            return
        self._loop.call_soon_threadsafe(self._deliver, message)

    def _deliver(self, message: dict[str, Any]) -> None:
        for q in list(self._clients):
            if q.full():
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(message)


def load_gallery(db: Session) -> list[tuple[str, np.ndarray]]:
    rows = (
        db.query(FaceEmbedding.user_id, FaceEmbedding.vector)
        .join(User, User.id == FaceEmbedding.user_id)
        .filter(User.active.is_(True))
        .all()
    )
    return [(uid, recognition.from_bytes(vec)) for uid, vec in rows]


class RecognitionWorker:
    def __init__(self, camera: CameraReader, broadcaster: Broadcaster, interval: float = 0.35):
        self.camera = camera
        self.broadcaster = broadcaster
        self.interval = interval
        self.latency_ms = 0.0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._gallery: list[tuple[str, np.ndarray]] = []
        self._gallery_stamp = 0.0

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)

    def refresh_gallery(self) -> None:
        self._gallery_stamp = 0.0

    def _gallery_for(self, db: Session) -> list[tuple[str, np.ndarray]]:
        if time.time() - self._gallery_stamp > 30:
            self._gallery = load_gallery(db)
            self._gallery_stamp = time.time()
        return self._gallery

    def _loop(self) -> None:
        while not self._stop.is_set():
            started = time.time()
            frame = self.camera.read()
            if frame is None:
                time.sleep(0.5)
                continue
            try:
                self._process(frame)
            except Exception as exc:  # keep the worker alive on any per-frame failure
                print(f"[recognition] frame skipped: {exc}")
            self.latency_ms = round((time.time() - started) * 1000, 1)
            time.sleep(max(0.0, self.interval - (time.time() - started)))

    def _process(self, frame: np.ndarray) -> None:
        height, width = frame.shape[:2]
        db = SessionLocal()
        try:
            settings = load_settings(db)
            gallery = self._gallery_for(db)
            detections: list[dict[str, Any]] = []
            check_in = None

            for idx, face in enumerate(recognition.detect(frame)):
                x, y, w, h = face.box
                name, known, confidence = "Unknown", False, float(face.det_score)

                if face.embedding is not None:
                    user_id, score = recognition.match(
                        face.embedding, gallery, settings.confidence_threshold
                    )
                    confidence = round(score, 3)
                    if user_id:
                        user = db.get(User, user_id)
                        if user:
                            name, known = user.name, True
                            result, _is_new = record(db, user, confidence, "face")
                            if result and check_in is None:
                                check_in = result.model_dump(by_alias=True)

                detections.append(
                    {
                        "id": f"d{idx}",
                        "name": name,
                        "confidence": confidence,
                        "known": known,
                        "x": round(x / width * 100, 2),
                        "y": round(y / height * 100, 2),
                        "w": round(w / width * 100, 2),
                        "h": round(h / height * 100, 2),
                    }
                )

            # QR badges held up to the camera check in too.
            for badge in recognition.decode_qr(frame):
                user = db.query(User).filter(User.student_id == badge.strip()).first()
                if user:
                    result, _ = record(db, user, 1.0, "badge")
                    if result and check_in is None:
                        check_in = result.model_dump(by_alias=True)

            message: dict[str, Any] = {"detections": detections}
            if check_in:
                message["checkIn"] = check_in
            self.broadcaster.publish(message)
        finally:
            db.close()
