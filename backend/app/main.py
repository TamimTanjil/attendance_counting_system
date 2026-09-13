"""FastAPI application for the Automatic Attendance Counting System."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import db
from .camera import _open, mjpeg_generator
from .config import ALLOWED_ORIGINS, FACES_DIR, MODEL_VERSION
from .models import (
    AttendanceLog,
    CameraTestPayload,
    CameraTestResult,
    CheckIn,
    DashboardStats,
    Detection,
    LabUser,
    NewUserPayload,
    SystemSettings,
)
from .pipeline import pipeline
from .recognition import recognizer


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    recognizer.load()
    pipeline.start(asyncio.get_running_loop())
    yield
    pipeline.stop()


app = FastAPI(title="LabSense Attendance API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.lovable\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------- stats ----------------------------------- #
@app.get("/api/stats/today", response_model=DashboardStats)
def stats_today() -> DashboardStats:
    users = db.list_users()
    today = db.attendance_on(date.today().isoformat())
    present = sum(1 for r in today if r["status"] == "present")
    late = sum(1 for r in today if r["status"] == "late")
    return DashboardStats(
        totalRegistered=len(users),
        presentToday=present,
        absentToday=max(len(users) - present - late, 0),
        lateToday=late,
        cameraOnline=pipeline.camera.online,
        fps=pipeline.camera.fps,
        latencyMs=pipeline.camera.latency_ms,
        modelVersion=MODEL_VERSION,
        qrScansToday=pipeline.qr_scans_today,
    )


# --------------------------------- users ----------------------------------- #
@app.get("/api/users", response_model=list[LabUser])
def get_users() -> list[LabUser]:
    return [LabUser(**u) for u in db.list_users()]


@app.post("/api/users", response_model=LabUser, status_code=201)
def create_user(payload: NewUserPayload) -> LabUser:
    if db.get_user_by_student_id(payload.studentId):
        raise HTTPException(409, "A user with this student ID already exists")
    return LabUser(
        **db.create_user(
            payload.name, payload.studentId, payload.department, payload.email, payload.photoCount
        )
    )


@app.post("/api/users/enroll", response_model=LabUser, status_code=201)
async def enroll_user(
    name: str = Form(...),
    studentId: str = Form(...),
    department: str = Form(...),
    email: str = Form(...),
    photos: list[UploadFile] = File(default=[]),
) -> LabUser:
    """Create a user and train the recogniser from multi-angle photos."""
    if db.get_user_by_student_id(studentId):
        raise HTTPException(409, "A user with this student ID already exists")
    user = db.create_user(name, studentId, department, email, 0)

    saved = 0
    for index, photo in enumerate(photos):
        face = recognizer.extract_face(await photo.read())
        if face is None:
            continue
        recognizer.save_sample(user["id"], index, face)
        saved += 1

    db.set_photo_count(user["id"], saved)
    if saved:
        recognizer.train()
    user["enrolledPhotos"] = saved
    return LabUser(**user)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: str) -> None:
    folder = FACES_DIR / user_id
    if folder.is_dir():
        for file in folder.glob("*"):
            file.unlink()
        folder.rmdir()
    db.delete_user(user_id)
    recognizer.train()


@app.post("/api/model/retrain")
def retrain() -> dict[str, int | str]:
    return {"samples": recognizer.train(), "modelVersion": MODEL_VERSION}


# ------------------------------- attendance -------------------------------- #
def _to_check_in(row: dict) -> CheckIn:
    return CheckIn(
        id=row["id"],
        studentId=row["student_id"],
        name=row.get("name") or row["student_id"],
        timestamp=row["created_at"],
        confidence=row["confidence"],
        status=row["status"],
        method=row.get("method", "face"),
    )


@app.get("/api/attendance/recent", response_model=list[CheckIn])
def recent_check_ins(limit: int = Query(20, ge=1, le=100)) -> list[CheckIn]:
    return [_to_check_in(r) for r in db.recent_check_ins(limit)]


@app.get("/api/attendance/logs", response_model=list[AttendanceLog])
def attendance_logs(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    query: Optional[str] = Query(None),
) -> list[AttendanceLog]:
    start = from_ or "1970-01-01"
    end = to or date.today().isoformat()
    rows = db.attendance_between(start, end)
    logs: list[AttendanceLog] = []
    for r in rows:
        if status and status != "all" and r["status"] != status:
            continue
        name = r.get("name") or r["student_id"]
        if query:
            q = query.lower()
            if q not in name.lower() and q not in r["student_id"].lower():
                continue
        logs.append(
            AttendanceLog(
                id=r["id"],
                date=r["date"],
                studentId=r["student_id"],
                name=name,
                entryTime=r["entry_time"],
                exitTime=r["exit_time"],
                status=r["status"],
            )
        )
    return logs


# -------------------------------- settings --------------------------------- #
@app.get("/api/settings", response_model=SystemSettings)
def get_settings() -> SystemSettings:
    return SystemSettings(**(db.get_settings() or {}))


@app.put("/api/settings", response_model=SystemSettings)
def update_settings(payload: SystemSettings) -> SystemSettings:
    data = payload.model_dump()
    db.save_settings(data)
    pipeline.apply_settings(data)
    return payload


# --------------------------------- camera ---------------------------------- #
@app.post("/api/camera/test", response_model=CameraTestResult)
def camera_test(payload: CameraTestPayload) -> CameraTestResult:
    cap = _open(payload.rtspUrl)
    try:
        if not cap.isOpened():
            return CameraTestResult(ok=False, message="Could not open the stream")
        ok, frame = cap.read()
        if not ok or frame is None:
            return CameraTestResult(ok=False, message="Stream opened but returned no frames")
        h, w = frame.shape[:2]
        return CameraTestResult(ok=True, message=f"Stream handshake succeeded · {w}x{h}")
    finally:
        cap.release()


@app.get("/api/camera/stream")
def camera_stream() -> StreamingResponse:
    return StreamingResponse(
        mjpeg_generator(pipeline.annotated_frame),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/camera/detections", response_model=list[Detection])
def current_detections() -> list[Detection]:
    return [Detection(**{k: v for k, v in d.items() if k != "studentId"}) for d in pipeline.detections]


@app.get("/api/camera/snapshot")
def snapshot() -> StreamingResponse:
    frame = pipeline.annotated_frame()
    ok, buf = cv2.imencode(".jpg", frame)
    if not ok:
        raise HTTPException(503, "No frame available")
    return StreamingResponse(iter([buf.tobytes()]), media_type="image/jpeg")


# -------------------------------- websocket -------------------------------- #
@app.websocket("/ws/detections")
async def detections_socket(ws: WebSocket) -> None:
    await ws.accept()
    queue = pipeline.subscribe()
    try:
        while True:
            payload = await queue.get()
            await ws.send_json(payload)
    except WebSocketDisconnect:
        pass
    finally:
        pipeline.unsubscribe(queue)


@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "cameraOnline": pipeline.camera.online,
        "source": pipeline.camera.source,
        "modelVersion": MODEL_VERSION,
        "time": datetime.now().isoformat(),
    }
