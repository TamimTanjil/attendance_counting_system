"""SQLite persistence: users, attendance rows and settings."""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import date, datetime
from typing import Any, Optional

from .config import DB_PATH, DEFAULT_SETTINGS

_lock = threading.Lock()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


_conn = connect()


def init_db() -> None:
    with _lock:
        _conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                student_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                department TEXT NOT NULL,
                email TEXT NOT NULL,
                enrolled_photos INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                label INTEGER
            );
            CREATE TABLE IF NOT EXISTS attendance (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                student_id TEXT NOT NULL,
                entry_time TEXT NOT NULL,
                exit_time TEXT,
                status TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 0,
                method TEXT NOT NULL DEFAULT 'face',
                created_at TEXT NOT NULL,
                UNIQUE (date, student_id)
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        _conn.commit()
    if get_settings() is None:
        save_settings(DEFAULT_SETTINGS)


# ------------------------------- settings --------------------------------- #

def get_settings() -> Optional[dict[str, Any]]:
    with _lock:
        row = _conn.execute("SELECT value FROM settings WHERE key = 'system'").fetchone()
    return json.loads(row["value"]) if row else None


def save_settings(data: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        _conn.execute(
            "INSERT INTO settings(key, value) VALUES('system', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (json.dumps(data),),
        )
        _conn.commit()
    return data


# --------------------------------- users ---------------------------------- #

def _user_row_to_dict(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"],
        "studentId": r["student_id"],
        "name": r["name"],
        "department": r["department"],
        "email": r["email"],
        "enrolledPhotos": r["enrolled_photos"],
        "active": bool(r["active"]),
        "createdAt": r["created_at"],
    }


def list_users() -> list[dict[str, Any]]:
    with _lock:
        rows = _conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
    return [_user_row_to_dict(r) for r in rows]


def get_user_by_student_id(student_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = _conn.execute(
            "SELECT * FROM users WHERE student_id = ?", (student_id,)
        ).fetchone()
    return _user_row_to_dict(row) if row else None


def get_user_by_label(label: int) -> Optional[dict[str, Any]]:
    with _lock:
        row = _conn.execute("SELECT * FROM users WHERE label = ?", (label,)).fetchone()
    return _user_row_to_dict(row) if row else None


def labelled_users() -> list[tuple[int, str]]:
    with _lock:
        rows = _conn.execute(
            "SELECT label, id FROM users WHERE label IS NOT NULL"
        ).fetchall()
    return [(r["label"], r["id"]) for r in rows]


def create_user(
    name: str, student_id: str, department: str, email: str, photo_count: int
) -> dict[str, Any]:
    user_id = f"u_{uuid.uuid4().hex[:8]}"
    with _lock:
        next_label = (
            _conn.execute("SELECT COALESCE(MAX(label), 0) + 1 AS n FROM users").fetchone()["n"]
        )
        _conn.execute(
            "INSERT INTO users(id, student_id, name, department, email, enrolled_photos,"
            " active, created_at, label) VALUES(?,?,?,?,?,?,1,?,?)",
            (
                user_id,
                student_id,
                name,
                department,
                email,
                photo_count,
                date.today().isoformat(),
                next_label,
            ),
        )
        _conn.commit()
        row = _conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _user_row_to_dict(row)


def set_photo_count(user_id: str, count: int) -> None:
    with _lock:
        _conn.execute("UPDATE users SET enrolled_photos = ? WHERE id = ?", (count, user_id))
        _conn.commit()


def delete_user(user_id: str) -> None:
    with _lock:
        _conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        _conn.commit()


# ------------------------------- attendance -------------------------------- #

def last_check_in(student_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = _conn.execute(
            "SELECT * FROM attendance WHERE student_id = ? ORDER BY created_at DESC LIMIT 1",
            (student_id,),
        ).fetchone()
    return dict(row) if row else None


def record_check_in(
    student_id: str, confidence: float, status: str, method: str, when: datetime
) -> dict[str, Any]:
    row_id = f"a_{uuid.uuid4().hex[:8]}"
    with _lock:
        _conn.execute(
            "INSERT INTO attendance(id, date, student_id, entry_time, exit_time, status,"
            " confidence, method, created_at) VALUES(?,?,?,?,NULL,?,?,?,?)"
            " ON CONFLICT(date, student_id) DO UPDATE SET"
            " exit_time = excluded.entry_time, confidence = excluded.confidence",
            (
                row_id,
                when.date().isoformat(),
                student_id,
                when.strftime("%H:%M"),
                status,
                confidence,
                method,
                when.isoformat(),
            ),
        )
        _conn.commit()
        row = _conn.execute(
            "SELECT * FROM attendance WHERE date = ? AND student_id = ?",
            (when.date().isoformat(), student_id),
        ).fetchone()
    return dict(row)


def recent_check_ins(limit: int = 20) -> list[dict[str, Any]]:
    with _lock:
        rows = _conn.execute(
            "SELECT a.*, u.name FROM attendance a LEFT JOIN users u"
            " ON u.student_id = a.student_id ORDER BY a.created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def attendance_between(start: str, end: str) -> list[dict[str, Any]]:
    with _lock:
        rows = _conn.execute(
            "SELECT a.*, u.name FROM attendance a LEFT JOIN users u"
            " ON u.student_id = a.student_id WHERE a.date BETWEEN ? AND ?"
            " ORDER BY a.date DESC, a.entry_time ASC",
            (start, end),
        ).fetchall()
    return [dict(r) for r in rows]


def attendance_on(day: str) -> list[dict[str, Any]]:
    return attendance_between(day, day)
