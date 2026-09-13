"""Threaded camera capture with MJPEG streaming and annotated overlays."""
from __future__ import annotations

import threading
import time
from typing import Any, Iterator, Optional

import cv2
import numpy as np

from .config import JPEG_QUALITY, PROCESS_EVERY_N_FRAMES


def _open(source: str) -> cv2.VideoCapture:
    if source.isdigit():
        return cv2.VideoCapture(int(source))
    return cv2.VideoCapture(source, cv2.CAP_FFMPEG)


class CameraStream:
    """Reads a camera/RTSP source in a background thread and keeps the newest frame."""

    def __init__(self, source: str) -> None:
        self.source = source
        self._cap: Optional[cv2.VideoCapture] = None
        self._frame: Optional[np.ndarray] = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.online = False
        self.fps = 0.0
        self.latency_ms = 0.0
        self.frame_index = 0

    # ------------------------------ lifecycle ----------------------------- #
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        if self._cap:
            self._cap.release()
        self._cap = None
        self.online = False

    def switch_source(self, source: str) -> None:
        if source == self.source:
            return
        self.stop()
        self.source = source
        self.start()

    # -------------------------------- loop -------------------------------- #
    def _loop(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            if self._cap is None or not self._cap.isOpened():
                self._cap = _open(self.source)
                if not self._cap.isOpened():
                    self.online = False
                    time.sleep(backoff)
                    backoff = min(backoff * 2, 10.0)
                    continue
                backoff = 1.0

            started = time.perf_counter()
            ok, frame = self._cap.read()
            if not ok or frame is None:
                self.online = False
                self._cap.release()
                self._cap = None
                time.sleep(0.5)
                continue

            elapsed = (time.perf_counter() - started) * 1000
            self.latency_ms = round(self.latency_ms * 0.9 + elapsed * 0.1, 1)
            self.fps = round(1000 / max(elapsed, 1e-3) * 0.1 + self.fps * 0.9, 1)
            self.online = True
            with self._lock:
                self._frame = frame
                self.frame_index += 1

    # ------------------------------- readers ------------------------------ #
    def read(self) -> Optional[np.ndarray]:
        with self._lock:
            return None if self._frame is None else self._frame.copy()

    def should_process(self) -> bool:
        return self.frame_index % max(PROCESS_EVERY_N_FRAMES, 1) == 0


def placeholder_frame(message: str) -> np.ndarray:
    frame = np.zeros((480, 854, 3), dtype=np.uint8)
    frame[:] = (18, 22, 20)
    cv2.putText(frame, message, (40, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (120, 220, 180), 2)
    return frame


def annotate(frame: np.ndarray, detections: list[dict[str, Any]]) -> np.ndarray:
    height, width = frame.shape[:2]
    for d in detections:
        x = int(d["x"] / 100 * width)
        y = int(d["y"] / 100 * height)
        w = int(d["w"] / 100 * width)
        h = int(d["h"] / 100 * height)
        colour = (120, 220, 90) if d["known"] else (60, 70, 240)
        cv2.rectangle(frame, (x, y), (x + w, y + h), colour, 2)
        tag = f"{d['name']} · {int(d['confidence'] * 100)}%"
        if d["kind"] == "qr":
            tag = f"QR · {d['name']}"
        cv2.rectangle(frame, (x, max(y - 22, 0)), (x + max(len(tag) * 9, 60), y), colour, -1)
        cv2.putText(
            frame, tag, (x + 4, max(y - 6, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (12, 16, 14), 1
        )
    return frame


def mjpeg_generator(get_annotated_frame, fps_cap: int = 20) -> Iterator[bytes]:
    interval = 1.0 / fps_cap
    while True:
        frame = get_annotated_frame()
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
        if ok:
            yield (
                b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                + str(len(buf)).encode()
                + b"\r\n\r\n"
                + buf.tobytes()
                + b"\r\n"
            )
        time.sleep(interval)
