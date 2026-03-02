from __future__ import annotations

import json
from pathlib import Path

from backend.config import settings
from backend.database import SessionLocal
from backend.models import Component, Skeleton
from backend.scripts.vehicle_spec import VEHICLES


CATEGORY_LABEL = {
    "head_tube": "Head Tube",
    "top_tube": "Top Tube",
    "down_tube": "Down Tube",
    "seat_tube": "Seat Tube",
    "motor_mount": "Motor Mount",
    "seat_stay": "Seat Stay",
    "chain_stay": "Chain Stay",
    "fork_end": "Fork End",
}


def read_svg(svg_root: Path, vehicle: str, filename: str) -> str | None:
    svg_file = svg_root / vehicle / filename
    if not svg_file.exists():
        return None
    return svg_file.read_text(encoding="utf-8")


def upsert_skeleton(
    payload: dict, vehicle: str, vehicle_meta: dict, svg_root: Path
) -> None:
    skeleton_data = payload.get("_skeleton")
    if not skeleton_data or "error" in skeleton_data:
        print(f"[SKIP] skeleton {vehicle}: invalid extract data")
        return

    with SessionLocal() as db:
        existing = db.query(Skeleton).filter(Skeleton.vehicle == vehicle).one_or_none()
        preview_svg = read_svg(svg_root, vehicle, "skeleton.svg")
        dwg_path = skeleton_data.get(
            "dwg_path",
            str(
                Path(settings.allowed_source_dir)
                / vehicle_meta["_folder"]
                / vehicle_meta["_skeleton"]
            ),
        )

        if existing is None:
            skeleton = Skeleton(
                vehicle=vehicle,
                name=f"{vehicle} skeleton",
                dwg_path=dwg_path,
                preview_svg=preview_svg,
                nodes=skeleton_data["nodes"],
                geometry=None,
            )
            db.add(skeleton)
        else:
            existing.name = f"{vehicle} skeleton"
            existing.dwg_path = dwg_path
            existing.preview_svg = preview_svg
            existing.nodes = skeleton_data["nodes"]

        db.commit()
        print(f"[OK] skeleton {vehicle}")


def upsert_component(
    payload: dict, vehicle: str, category: str, vehicle_meta: dict, svg_root: Path
) -> None:
    item = payload.get(category)
    if not item or "error" in item:
        print(f"[SKIP] component {vehicle}/{category}: invalid extract data")
        return

    dwg_filename = item.get("dwg_filename") or vehicle_meta[category]
    full_code = Path(dwg_filename).stem
    label = CATEGORY_LABEL.get(category, category)
    preview_svg = read_svg(svg_root, vehicle, f"{category}.svg")

    with SessionLocal() as db:
        existing = (
            db.query(Component).filter(Component.full_code == full_code).one_or_none()
        )
        values = {
            "name": f"{label} {full_code}",
            "full_code": full_code,
            "category": category,
            "vehicle": vehicle,
            "dwg_path": item.get("dwg_path")
            or str(
                Path(settings.allowed_source_dir)
                / vehicle_meta["_folder"]
                / dwg_filename
            ),
            "dwg_filename": dwg_filename,
            "preview_svg": preview_svg,
            "attach_primary": item.get("attach_primary"),
            "attach_block_name": item.get("attach_block_name"),
            "pa_default": item.get("pa_default"),
            "pb_default": item.get("pb_default"),
            "physical_length_mm": None,
            "specifications": None,
            "metadata_json": {
                "source": "phase1_seed",
                "dxf_path": item.get("dxf_path"),
            },
        }

        if existing is None:
            db.add(Component(**values))
        else:
            for key, value in values.items():
                setattr(existing, key, value)

        db.commit()
        print(f"[OK] component {vehicle}/{category}")


def main() -> int:
    attach_json = Path(settings.attach_points_json)
    if not attach_json.exists():
        raise FileNotFoundError(f"Attach points file not found: {attach_json}")

    payload = json.loads(attach_json.read_text(encoding="utf-8"))
    svg_root = Path(settings.svg_output_dir)

    for vehicle, vehicle_meta in VEHICLES.items():
        if vehicle not in payload:
            print(f"[SKIP] {vehicle}: no extract data")
            continue

        vehicle_data = payload[vehicle]
        upsert_skeleton(vehicle_data, vehicle, vehicle_meta, svg_root)

        for category in vehicle_meta:
            if category.startswith("_"):
                continue
            upsert_component(vehicle_data, vehicle, category, vehicle_meta, svg_root)

    print("Seed complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
