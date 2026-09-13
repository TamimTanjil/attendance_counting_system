"""Runtime configuration for the attendance backend."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
FACES_DIR = DATA_DIR / "faces"
DB_PATH = DATA_DIR / "attendance.db"
MODEL_PATH = DATA_DIR / "lbph.yml"

DATA_DIR.mkdir(parents=True, exist_ok=True)
FACES_DIR.mkdir(parents=True, exist_ok=True)

# Camera source: an RTSP/HTTP URL, or a webcam index like "0".
DEFAULT_RTSP_URL = os.getenv("RTSP_URL", "0")

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:8080,http://127.0.0.1:8080",
    ).split(",")
    if o.strip()
]

DEFAULT_SETTINGS = {
    "rtspUrl": DEFAULT_RTSP_URL,
    "confidenceThreshold": 0.78,
    "duplicateTimeoutMinutes": 15,
    "lateAfter": "09:15",
    "autoExitEnabled": True,
    "notifyOnUnknownFace": True,
}

JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "80"))
PROCESS_EVERY_N_FRAMES = int(os.getenv("PROCESS_EVERY_N_FRAMES", "3"))
MODEL_VERSION = "opencv-lbph + qr · v1.0"
