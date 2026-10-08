"""Tables: documents/chunks, plans, attempts, mastery, streaks, badges."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .config import get_settings
from .db import Base, is_postgres

if is_postgres():
    from pgvector.sqlalchemy import Vector

    Embedding = Vector(get_settings().embed_dim)
else:
    Embedding = JSON  # SQLite dev fallback: cosine similarity in Python


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    source_type: Mapped[str] = mapped_column(String(20), default="upload")
    filename: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    ord: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    embedding = mapped_column(Embedding, nullable=True)


class StudyPlan(Base):
    __tablename__ = "study_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_date: Mapped[str] = mapped_column(String(10))  # YYYY-MM-DD
    topics: Mapped[list] = mapped_column(JSON, default=list)
    schedule: Mapped[list] = mapped_column(JSON, default=list)  # [{date, topic, minutes, done}]
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Attempt(Base):
    __tablename__ = "attempts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))  # quiz | mock | oral
    topic: Mapped[str] = mapped_column(String(300), default="")
    items: Mapped[list] = mapped_column(JSON, default=list)
    score: Mapped[float] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Mastery(Base):
    __tablename__ = "mastery"
    topic: Mapped[str] = mapped_column(String(300), primary_key=True)
    level: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class StudyDay(Base):
    __tablename__ = "study_days"
    day: Mapped[str] = mapped_column(String(10), primary_key=True)  # YYYY-MM-DD
    minutes: Mapped[int] = mapped_column(Integer, default=0)


class Badge(Base):
    __tablename__ = "badges"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    awarded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
