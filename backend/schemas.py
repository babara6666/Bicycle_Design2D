from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class Point(BaseModel):
    x: float
    y: float


class ComponentBase(BaseModel):
    id: int
    name: str
    full_code: str
    category: str
    vehicle: str

    model_config = ConfigDict(from_attributes=True)


class ComponentListItem(ComponentBase):
    dwg_filename: str
    attach_block_name: str | None = None


class ComponentDetail(ComponentBase):
    preview_svg: str | None = None
    attach_primary: Point | None = None
    attach_block_name: str | None = None
    pa_default: Point | None = None
    pb_default: Point | None = None
    physical_length_mm: float | None = None
    specifications: dict | None = None


class SkeletonListItem(BaseModel):
    id: int
    vehicle: str
    name: str

    model_config = ConfigDict(from_attributes=True)


class SkeletonDetail(SkeletonListItem):
    dwg_path: str
    preview_svg: str | None = None
    nodes: dict
    geometry: dict | None = None
    created_at: datetime


class ConfigurationComponentRef(BaseModel):
    category: str
    component_id: int


class ConfigurationCreate(BaseModel):
    skeleton_id: int
    name: str | None = None
    components: list[ConfigurationComponentRef]
    pa_position: Point | None = None
    pb_position: Point | None = None
    seat_tube_override: dict | None = None
    overrides: dict | None = None


class ConfigurationConstraintsPatch(BaseModel):
    pa_position: Point | None = None
    pb_position: Point | None = None
    seat_tube_override: dict | None = None
    overrides: dict | None = None


class ConfigurationDetail(BaseModel):
    id: int
    skeleton_id: int | None = None
    name: str | None = None
    components: list[ConfigurationComponentRef]
    pa_position: Point | None = None
    pb_position: Point | None = None
    seat_tube_override: dict | None = None
    overrides: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConfigurationListItem(BaseModel):
    id: int
    skeleton_id: int | None = None
    name: str | None = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConfirmPaPbPayload(BaseModel):
    pa: Point
    pb: Point
    skeleton_id: int | None = None
    head_tube_angle_deg: float = 0.0


class HealthOut(BaseModel):
    ok: bool
