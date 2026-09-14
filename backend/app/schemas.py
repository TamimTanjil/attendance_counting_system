from pydantic import BaseModel, ConfigDict


def to_camel(s: str) -> str:
    head, *rest = s.split("_")
    return head + "".join(w.capitalize() for w in rest)


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class LabUser(Camel):
    id: str
    student_id: str
    name: str
    department: str
    email: str
    enrolled_photos: int
    active: bool
    created_at: str


class CheckIn(Camel):
    id: str
    student_id: str
    name: str
    timestamp: str
    confidence: float
    status: str


class AttendanceLog(Camel):
    id: str
    date: str
    student_id: str
    name: str
    entry_time: str
    exit_time: str | None
    status: str


class SystemSettings(Camel):
    rtsp_url: str
    confidence_threshold: float
    duplicate_timeout_minutes: int
    late_after: str
    auto_exit_enabled: bool
    notify_on_unknown_face: bool


class DashboardStats(Camel):
    total_registered: int
    present_today: int
    absent_today: int
    late_today: int
    camera_online: bool
    fps: float
    latency_ms: float
    model_version: str


class BadgePayload(Camel):
    badge_id: str


class CameraTestPayload(Camel):
    rtsp_url: str


class NewUserPayload(Camel):
    name: str
    student_id: str
    department: str
    email: str
    photo_count: int = 0
