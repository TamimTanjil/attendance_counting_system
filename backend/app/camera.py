"""Background camera reader.

One thread owns the capture device and keeps only the newest frame, so the MJPEG
stream, the recognition worker and the QR scanner never fight over the device.
"""

from __future__ import annotations

import threading
import time

import cv2
import numpy as np


def _source(value: str):
    return int(value) if value.isdigit() else value


class CameraReader:
    def __init__(self, source: str):
        self.source = source
        self._frame: np.ndarray | None = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.online = False
        self.fps = 0.0

    # ------------------------------------------------------------------ control
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
        self.online = False

    def switch(self, source: str) -> None:
        self.stop()
        self.source = source
        self.start()

    # --------------------------------------------------------------------- loop
    def _loop(self) -> None:
        while not self._stop.is_set():
            cap = cv2.VideoCapture(_source(self.source))
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if not cap.isOpened():
                self.online = False
                time.sleep(3)
                continue

            self.online = True
            last, frames = time.time(), 0
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok:
                    break
                with self._lock:
                    self._frame = frame
                frames += 1
                now = time.time()
                if now - last >= 1:
                    self.fps = round(frames / (now - last), 1)
                    last, frames = now, 0
            cap.release()
            self.online = False
            time.sleep(1)  # reconnect

    # --------------------------------------------------------------------- read
    def read(self) -> np.ndarray | None:
        with self._lock:
            return None if self._frame is None else self._frame.copy()

    def jpeg(self, quality: int = 80) -> bytes | None:
        frame = self.read()
        if frame is None:
            return None
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        return buf.tobytes() if ok else None

    def mjpeg(self, fps: int = 20):
        """Generator for multipart/x-mixed-replace responses."""
        interval = 1 / fps
        while True:
            data = self.jpeg()
            if data:
                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(data)).encode() + b"\r\n\r\n" + data + b"\r\n"
                )
            time.sleep(interval)


def probe(source: str, timeout: float = 6.0) -> tuple[bool, str]:
    """Open a source briefly to verify it delivers frames (used by /api/camera/test)."""
    start = time.time()
    cap = cv2.VideoCapture(_source(source))
    try:
        if not cap.isOpened():
            return False, "Could not open the stream — check the URL, credentials or device."
        while time.time() - start < timeout:
            ok, frame = cap.read()
            if ok and frame is not None:
                h, w = frame.shape[:2]
                return True, f"Stream handshake succeeded · {w}x{h}"
        return False, "Connected but no frames arrived before the timeout."
    finally:
        cap.release()
