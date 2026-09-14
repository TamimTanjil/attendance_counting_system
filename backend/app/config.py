import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

CAMERA_SOURCE = os.getenv("CAMERA_SOURCE", "0")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'attendance.db'}")
MEDIA_DIR = Path(os.getenv("MEDIA_DIR", BASE_DIR / "media"))
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:8080,http://localhost:5173",
    ).split(",")
    if o.strip()
]

MEDIA_DIR.mkdir(parents=True, exist_ok=True)
