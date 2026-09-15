"""Settings persisted as key/value rows, exposed with the frontend's shape."""

from __future__ import annotations

from sqlalchemy.orm import Session

from .config import CAMERA_SOURCE
from .models import Setting
from .schemas import SystemSettings

DEFAULTS: dict[str, str] = {
    "rtsp_url": CAMERA_SOURCE,
    "confidence_threshold": "0.72",
    "duplicate_timeout_minutes": "30",
    "late_after": "09:30",
    "auto_exit_enabled": "true",
    "notify_on_unknown_face": "true",
}


def _raw(db: Session) -> dict[str, str]:
    values = dict(DEFAULTS)
    for row in db.query(Setting).all():
        values[row.key] = row.value
    return values


def load(db: Session) -> SystemSettings:
    v = _raw(db)
    return SystemSettings(
        rtsp_url=v["rtsp_url"],
        confidence_threshold=float(v["confidence_threshold"]),
        duplicate_timeout_minutes=int(v["duplicate_timeout_minutes"]),
        late_after=v["late_after"],
        auto_exit_enabled=v["auto_exit_enabled"] == "true",
        notify_on_unknown_face=v["notify_on_unknown_face"] == "true",
    )


def save(db: Session, settings: SystemSettings) -> SystemSettings:
    payload = {
        "rtsp_url": settings.rtsp_url,
        "confidence_threshold": str(settings.confidence_threshold),
        "duplicate_timeout_minutes": str(settings.duplicate_timeout_minutes),
        "late_after": settings.late_after,
        "auto_exit_enabled": "true" if settings.auto_exit_enabled else "false",
        "notify_on_unknown_face": "true" if settings.notify_on_unknown_face else "false",
    }
    for key, value in payload.items():
        row = db.get(Setting, key)
        if row:
            row.value = value
        else:
            db.add(Setting(key=key, value=value))
    db.commit()
    return load(db)
