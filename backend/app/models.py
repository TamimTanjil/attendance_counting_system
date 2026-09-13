"""Pydantic schemas — camelCase to match the dashboard types 1:1."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

AttendanceStatus = Literal["present", "late", "absent"]


class LabUser(BaseModel):
    id: str
    studentId: str
    name: str
    department: str
    email: str
    enrolledPhotos: int
    active: bool
    createdAt: str


class NewUserPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    studentId: str = Field(min_length=1, max_length=64)
    department: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=3, max_length=200)
    photoCount: int = 0


class CheckIn(BaseModel):
    id: str
    studentId: str
    name: str
    timestamp: str
    confidence: float
    status: AttendanceStatus
    method: Literal["face", "qr"] = "face"


class AttendanceLog(BaseModel):
    id: str
    date: str
    studentId: str
    name: str
    entryTime: str
    exitTime: Optional[str] = None
    status: AttendanceStatus


class SystemSettings(BaseModel):
    rtspUrl: str
    confidenceThreshold: float = Field(ge=0.3, le=0.99)
    duplicateTimeoutMinutes: int = Field(ge=0, le=600)
    lateAfter: str
    autoExitEnabled: bool
    notifyOnUnknownFace: bool


class DashboardStats(BaseModel):
    totalRegistered: int
    presentToday: int
    absentToday: int
    lateToday: int
    cameraOnline: bool
    fps: float
    latencyMs: float
    modelVersion: str
    qrScansToday: int = 0


class CameraTestPayload(BaseModel):
    rtspUrl: str


class CameraTestResult(BaseModel):
    ok: bool
    message: str


class Detection(BaseModel):
    id: str
    name: str
    confidence: float
    x: float
    y: float
    w: float
    h: float
    known: bool
    kind: Literal["face", "qr"] = "face"
