"""FastAPI application — the real backend behind the attendance dashboard.

Run it with:  uvicorn app.main:app --reload --port 8000
Then point the frontend at it:  VITE_API_BASE_URL=http://localhost:8000
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import recognition
from .attendance import record
from .camera import CameraReader, probe
from .config import CORS_ORIGINS, MEDIA_DIR
from .db import get_db, init_db, SessionLocal
from .models import Attendance, FaceEmbedding, User
from .pipeline import Broadcaster, RecognitionWorker
from .schemas import (
    AttendanceLog,
    BadgePayload,
    CameraTestPayload,
    CheckIn,
    DashboardStats,
    LabUser,
    SystemSettings,
)
from .settings_store import load as load_settings, save as save_settings

broadcaster = Broadcaster()
camera: CameraReader | None = None
worker: RecognitionWorker | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    global camera, worker
    init_db()
    db = SessionLocal()
    try:
        source = load_settings(db).rtsp_url
    finally:
        db.close()

    broadcaster.bind_loop(asyncio.get_running_loop())
    camera = CameraReader(source)
    camera.start()
    worker = RecognitionWorker(camera, broadcaster)
    worker.start()
    yield
    worker.stop()
    camera.stop()


app = FastAPI(title="Lab Attendance API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------- helpers
def _user_out(db: Session, user: User) -> LabUser:
    photos = db.scalar(
        select(func.count(FaceEmbedding.id)).where(FaceEmbedding.user_id == user.id)
    )
    return LabUser(
        id=user.id,
        student_id=user.student_id,
        name=user.name,
        department=user.department,
        email=user.email,
        enrolled_photos=int(photos or 0),
        active=user.active,
        created_at=user.created_at.isoformat(),
    )


def _log_out(row: Attendance, user: User) -> AttendanceLog:
    return AttendanceLog(
        id=f"l_{row.id}",
        date=row.day.isoformat(),
        student_id=user.student_id,
        name=user.name,
        entry_time=row.entry_at.strftime("%H:%M"),
        exit_time=row.exit_at.strftime("%H:%M") if row.exit_at else None,
        status=row.status,
    )


# ----------------------------------------------------------------------- stats
@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "recognition": recognition.mode(),
        "model": recognition.MODEL_VERSION,
        "cameraOnline": bool(camera and camera.online),
    }


@app.get("/api/stats/today", response_model=DashboardStats, response_model_by_alias=True)
def stats_today(db: Session = Depends(get_db)) -> DashboardStats:
    today = date.today()
    total = db.scalar(select(func.count(User.id)).where(User.active.is_(True))) or 0
    present = db.scalar(
        select(func.count(Attendance.id)).where(
            Attendance.day == today, Attendance.status.in_(("present", "late"))
        )
    ) or 0
    late = db.scalar(
        select(func.count(Attendance.id)).where(Attendance.day == today, Attendance.status == "late")
    ) or 0
    return DashboardStats(
        total_registered=int(total),
        present_today=int(present),
        absent_today=max(int(total) - int(present), 0),
        late_today=int(late),
        camera_online=bool(camera and camera.online),
        fps=camera.fps if camera else 0.0,
        latency_ms=worker.latency_ms if worker else 0.0,
        model_version=recognition.MODEL_VERSION,
    )


# ----------------------------------------------------------------------- users
@app.get("/api/users", response_model=list[LabUser], response_model_by_alias=True)
def list_users(db: Session = Depends(get_db)) -> list[LabUser]:
    users = db.query(User).order_by(User.created_at.desc(), User.name).all()
    return [_user_out(db, u) for u in users]


@app.post("/api/users", response_model=LabUser, response_model_by_alias=True)
async def enroll_user(
    name: str = Form(...),
    studentId: str = Form(...),
    department: str = Form(...),
    email: str = Form(...),
    angles: str = Form("[]"),
    photos: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
) -> LabUser:
    if db.query(User).filter(User.student_id == studentId).first():
        raise HTTPException(409, f"Student ID {studentId} is already enrolled.")

    try:
        angle_names = json.loads(angles)
    except json.JSONDecodeError:
        angle_names = []

    user = User(
        id=uuid.uuid4().hex[:12],
        student_id=studentId,
        name=name,
        department=department,
        email=email,
    )
    db.add(user)
    db.flush()

    stored = 0
    for idx, upload in enumerate(photos):
        raw = await upload.read()
        angle = angle_names[idx] if idx < len(angle_names) else f"angle-{idx}"
        path = MEDIA_DIR / f"{user.id}-{angle}.jpg"
        path.write_bytes(raw)

        vector = recognition.embed_image(raw)
        if vector is None:
            continue
        db.add(
            FaceEmbedding(
                user_id=user.id,
                angle=angle,
                photo_path=str(path),
                vector=recognition.to_bytes(vector),
            )
        )
        stored += 1

    db.commit()
    if worker:
        worker.refresh_gallery()

    if stored == 0 and photos and recognition.recognition_available():
        raise HTTPException(422, "No usable face was found in the uploaded photos.")
    return _user_out(db, user)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: str, db: Session = Depends(get_db)) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    if worker:
        worker.refresh_gallery()


# ------------------------------------------------------------------ attendance
@app.get("/api/attendance/recent", response_model=list[CheckIn], response_model_by_alias=True)
def recent_checkins(limit: int = 25, db: Session = Depends(get_db)) -> list[CheckIn]:
    rows = (
        db.query(Attendance, User)
        .join(User, User.id == Attendance.user_id)
        .order_by(Attendance.entry_at.desc())
        .limit(limit)
        .all()
    )
    return [
        CheckIn(
            id=f"c_{row.id}",
            student_id=user.student_id,
            name=user.name,
            timestamp=(row.exit_at or row.entry_at).isoformat(),
            confidence=round(row.confidence, 3),
            status=row.status,
        )
        for row, user in rows
    ]


@app.get("/api/attendance/logs", response_model=list[AttendanceLog], response_model_by_alias=True)
def attendance_logs(
    from_: str | None = None,
    to: str | None = None,
    status: str | None = None,
    query: str | None = None,
    db: Session = Depends(get_db),
) -> list[AttendanceLog]:
    q = db.query(Attendance, User).join(User, User.id == Attendance.user_id)
    if from_:
        q = q.filter(Attendance.day >= date.fromisoformat(from_))
    if to:
        q = q.filter(Attendance.day <= date.fromisoformat(to))
    if status and status != "all":
        q = q.filter(Attendance.status == status)
    if query:
        like = f"%{query.lower()}%"
        q = q.filter(func.lower(User.name).like(like) | func.lower(User.student_id).like(like))
    rows = q.order_by(Attendance.day.desc(), Attendance.entry_at.desc()).limit(2000).all()
    return [_log_out(row, user) for row, user in rows]


# FastAPI cannot bind the reserved word `from` as a parameter name, so the
# frontend's `?from=` is aliased onto `from_` here.
attendance_logs.__annotations__  # noqa: B018  (kept for clarity)
for route in app.routes:
    if getattr(route, "path", "") == "/api/attendance/logs":
        for param in route.dependant.query_params:  # type: ignore[attr-defined]
            if param.name == "from_":
                param.alias = "from"


@app.post("/api/attendance/badge", response_model=CheckIn, response_model_by_alias=True)
def badge_checkin(payload: BadgePayload, db: Session = Depends(get_db)) -> CheckIn:
    badge = payload.badge_id.strip()
    user = db.query(User).filter(func.lower(User.student_id) == badge.lower()).first()
    if not user:
        raise HTTPException(404, f"No student registered for badge {badge}")

    result, _is_new = record(db, user, 1.0, "badge")
    if result is None:
        raise HTTPException(429, f"{user.name} already checked in recently.")
    broadcaster.publish({"detections": [], "checkIn": result.model_dump(by_alias=True)})
    return result


# ---------------------------------------------------------------------- camera
@app.get("/api/camera/stream")
def camera_stream() -> StreamingResponse:
    if camera is None:
        raise HTTPException(503, "Camera is not running")
    return StreamingResponse(
        camera.mjpeg(), media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.post("/api/camera/test")
def camera_test(payload: CameraTestPayload) -> dict[str, object]:
    ok, message = probe(payload.rtsp_url)
    return {"ok": ok, "message": message}


@app.websocket("/ws/detections")
async def detections_socket(ws: WebSocket) -> None:
    await ws.accept()
    queue = broadcaster.subscribe()
    try:
        while True:
            message = await queue.get()
            await ws.send_json(message)
    except WebSocketDisconnect:
        pass
    finally:
        broadcaster.unsubscribe(queue)


# -------------------------------------------------------------------- settings
@app.get("/api/settings", response_model=SystemSettings, response_model_by_alias=True)
def get_settings(db: Session = Depends(get_db)) -> SystemSettings:
    return load_settings(db)


@app.put("/api/settings", response_model=SystemSettings, response_model_by_alias=True)
def put_settings(payload: SystemSettings, db: Session = Depends(get_db)) -> SystemSettings:
    previous = load_settings(db)
    saved = save_settings(db, payload)
    if camera and saved.rtsp_url != previous.rtsp_url:
        camera.switch(saved.rtsp_url)
    return saved


# ------------------------------------------------------ maintenance / absences
@app.post("/api/attendance/close-day")
def close_day(db: Session = Depends(get_db)) -> dict[str, int]:
    """Stamp a closing exit time on anyone still open for today."""
    now = datetime.now()
    rows = db.query(Attendance).filter(Attendance.day == date.today(), Attendance.exit_at.is_(None)).all()
    for row in rows:
        row.exit_at = now if now > row.entry_at else row.entry_at + timedelta(minutes=1)
    db.commit()
    return {"closed": len(rows)}
