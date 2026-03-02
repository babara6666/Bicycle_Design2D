from __future__ import annotations

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    """Application user.  Roles: viewer | editor | admin"""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False, default="viewer")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Component(Base):
    __tablename__ = "components"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    full_code: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    vehicle: Mapped[str] = mapped_column(Text, nullable=False)
    dwg_path: Mapped[str] = mapped_column(Text, nullable=False)
    dwg_filename: Mapped[str] = mapped_column(Text, nullable=False)

    preview_svg: Mapped[str | None] = mapped_column(Text)
    attach_primary: Mapped[dict | None] = mapped_column(JSONB)
    attach_block_name: Mapped[str | None] = mapped_column(Text)
    pa_default: Mapped[dict | None] = mapped_column(JSONB)
    pb_default: Mapped[dict | None] = mapped_column(JSONB)

    physical_length_mm: Mapped[float | None] = mapped_column(Float)
    specifications: Mapped[dict | None] = mapped_column(JSONB)
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSONB)


class Skeleton(Base):
    __tablename__ = "skeletons"
    __table_args__ = (UniqueConstraint("vehicle", name="uq_skeletons_vehicle"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vehicle: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    dwg_path: Mapped[str] = mapped_column(Text, nullable=False)
    preview_svg: Mapped[str | None] = mapped_column(Text)
    nodes: Mapped[dict] = mapped_column(JSONB, nullable=False)
    geometry: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    configurations: Mapped[list[Configuration]] = relationship(
        back_populates="skeleton"
    )


class Configuration(Base):
    __tablename__ = "configurations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    skeleton_id: Mapped[int | None] = mapped_column(ForeignKey("skeletons.id"))
    name: Mapped[str | None] = mapped_column(Text)
    components: Mapped[list] = mapped_column(JSONB, nullable=False)
    pa_position: Mapped[dict | None] = mapped_column(JSONB)
    pb_position: Mapped[dict | None] = mapped_column(JSONB)
    seat_tube_override: Mapped[dict | None] = mapped_column(JSONB)
    overrides: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    skeleton: Mapped[Skeleton | None] = relationship(back_populates="configurations")
    drawing_jobs: Mapped[list[DrawingJob]] = relationship(
        back_populates="configuration"
    )


class DrawingJob(Base):
    __tablename__ = "drawing_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    configuration_id: Mapped[int | None] = mapped_column(
        ForeignKey("configurations.id")
    )

    status: Mapped[str] = mapped_column(Text, default="pending")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    current_step: Mapped[str | None] = mapped_column(Text)

    dxf_path: Mapped[str | None] = mapped_column(Text)
    dwg_path: Mapped[str | None] = mapped_column(Text)
    pdf_path: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    configuration: Mapped[Configuration | None] = relationship(
        back_populates="drawing_jobs"
    )
