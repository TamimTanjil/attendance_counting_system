"""Attendance write path shared by face recognition and QR badge check-ins."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Attendance, User
from .schemas import CheckIn
from .settings_store import load as load_settings


def _late_cutoff(value: str) -> time:
    try:
        hh, mm = value.split(":")
        return time(int(hh), int(mm))
    except Exception:
        return time(9, 30)


def record(db: Session, user: User, confidence: float, method: str) -> tuple[CheckIn | None, bool]:
    """Stamp entry (or refresh exit) for `user`.

    Returns (check_in, is_new). `check_in` is None when the anti-duplicate
    timeout swallowed the sighting.
    """
    settings = load_settings(db)
    now = datetime.now()
    today = date.today()

    row = db.scalar(select(Attendance).where(Attendance.user_id == user.id, Attendance.day == today))

    if row is None:
        status = "late" if now.time() > _late_cutoff(settings.late_after) else "present"
        row = Attendance(
            user_id=user.id,
            day=today,
            entry_at=now,
            status=status,
            confidence=confidence,
            method=method,
        )
        db.add(row)
        db.commit()
        return _to_checkin(row, user), True

    # Already seen today — only update the exit stamp, and only outside the window.
    window = timedelta(minutes=settings.duplicate_timeout_minutes)
    latest = row.exit_at or row.entry_at
    if now - latest < window:
        return None, False

    if settings.auto_exit_enabled:
        row.exit_at = now
        db.commit()
    return _to_checkin(row, user), False


def _to_checkin(row: Attendance, user: User) -> CheckIn:
    return CheckIn(
        id=f"c_{row.id}",
        student_id=user.student_id,
        name=user.name,
        timestamp=(row.exit_at or row.entry_at).isoformat(),
        confidence=round(row.confidence, 3),
        status=row.status,
    )
