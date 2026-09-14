from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    student_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    department: Mapped[str] = mapped_column(String(64))
    email: Mapped[str] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[date] = mapped_column(Date, default=date.today)

    faces: Mapped[list["FaceEmbedding"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    attendance: Mapped[list["Attendance"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class FaceEmbedding(Base):
    """One row per enrolment angle. `vector` is a float32 numpy array as bytes."""

    __tablename__ = "face_embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    angle: Mapped[str] = mapped_column(String(32), default="front")
    photo_path: Mapped[str | None] = mapped_column(String(400), nullable=True)
    vector: Mapped[bytes] = mapped_column(LargeBinary)

    user: Mapped[User] = relationship(back_populates="faces")


class Attendance(Base):
    """One row per user per day. Entry stamped on first match, exit on last."""

    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_attendance_user_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    entry_at: Mapped[datetime] = mapped_column(DateTime)
    exit_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="present")
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    method: Mapped[str] = mapped_column(String(16), default="face")  # face | badge

    user: Mapped[User] = relationship(back_populates="attendance")


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(400))
