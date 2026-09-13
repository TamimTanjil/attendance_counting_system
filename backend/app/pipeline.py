"""Recognition pipeline: turns detections into attendance rows and live events."""
from __future__ import annotations

import asyncio
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Optional

from . import db
from .camera import CameraStream, annotate, placeholder_frame
from .recognition import recognizer


class Pipeline:
    def __init__(self) -> None:
        settings = db.get_settings() or {}
        self.camera = CameraStream(str(settings.get("rtspUrl", "0")))
        self._detections: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._subscribers: set[asyncio.Queue] = set()
        self.qr_scans_today = 0

    # ------------------------------ lifecycle ----------------------------- #
    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self.camera.start()
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop_body, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        self.camera.stop()

    def apply_settings(self, settings: dict[str, Any]) -> None:
        self.camera.switch_source(str(settings["rtspUrl"]))

    # ----------------------------- subscribers ---------------------------- #
    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=10)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

    def _publish(self, payload: dict[str, Any]) -> None:
        if not self._loop:
            return
        for queue in list(self._subscribers):
            try:
                self._loop.call_soon_threadsafe(queue.put_nowait, payload)
            except (asyncio.QueueFull, RuntimeError):
                pass

    # -------------------------------- state ------------------------------- #
    @property
    def detections(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._detections)

    def annotated_frame(self):
        frame = self.camera.read()
        if frame is None:
            return placeholder_frame(f"Waiting for camera: {self.camera.source}")
        return annotate(frame, self.detections)

    # ------------------------------ main loop ----------------------------- #
    def _loop_body(self) -> None:
        while not self._stop.is_set():
            frame = self.camera.read()
            if frame is None:
                time.sleep(0.3)
                continue

            settings = db.get_settings() or {}
            threshold = float(settings.get("confidenceThreshold", 0.78))
            detections = recognizer.detect(frame, threshold)
            with self._lock:
                self._detections = detections

            for d in detections:
                if d.get("studentId"):
                    self._maybe_check_in(d, settings)

            self._publish({"type": "detections", "detections": detections})
            time.sleep(0.25)

    def _maybe_check_in(self, detection: dict[str, Any], settings: dict[str, Any]) -> None:
        student_id = detection["studentId"]
        now = datetime.now()
        timeout = int(settings.get("duplicateTimeoutMinutes", 15))
        previous = db.last_check_in(student_id)
        if previous:
            seen = datetime.fromisoformat(previous["created_at"])
            if now - seen < timedelta(minutes=timeout):
                return

        late_after = str(settings.get("lateAfter", "09:15"))
        hour, minute = (int(p) for p in late_after.split(":"))
        status = "late" if (now.hour, now.minute) > (hour, minute) else "present"
        row = db.record_check_in(
            student_id, float(detection["confidence"]), status, detection["kind"], now
        )
        if detection["kind"] == "qr":
            self.qr_scans_today += 1

        self._publish(
            {
                "type": "checkin",
                "checkIn": {
                    "id": row["id"],
                    "studentId": student_id,
                    "name": detection["name"],
                    "timestamp": now.isoformat(),
                    "confidence": float(detection["confidence"]),
                    "status": status,
                    "method": detection["kind"],
                },
            }
        )


pipeline = Pipeline()
