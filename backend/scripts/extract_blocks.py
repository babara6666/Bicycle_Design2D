from __future__ import annotations

import argparse
import json
from pathlib import Path

import ezdxf

from backend.config import settings
from backend.scripts.vehicle_spec import (
    ALL_KNOWN_BLOCKS,
    CATEGORY_PRIMARY_BLOCK,
    CATEGORY_SECONDARY_BLOCK,
    SKELETON_ATTACH_BLOCKS,
    VEHICLES,
)


def to_dxf_name(filename: str) -> str:
    return f"{Path(filename).stem}.dxf"


def _block_crosshair_centre(doc, block_name: str, insert_pos) -> dict[str, float]:
    """Compute the real-world position of a crosshair block.

    Each attach block contains two perpendicular LINEs that form a "+"
    marker.  The INSERT reference may sit at (0,0) while the actual
    crosshair geometry lives at absolute DXF coordinates inside the block
    definition.  We compute the centre as the average midpoint of all
    LINE entities in the block, then offset by the INSERT position.
    """
    try:
        block = doc.blocks.get(block_name)
    except Exception:
        block = None

    if not block:
        # Fallback: just use the INSERT position
        return {"x": round(insert_pos.x, 4), "y": round(insert_pos.y, 4)}

    xs: list[float] = []
    ys: list[float] = []
    for entity in block:
        if entity.dxftype() == "LINE":
            mid_x = (entity.dxf.start.x + entity.dxf.end.x) / 2
            mid_y = (entity.dxf.start.y + entity.dxf.end.y) / 2
            xs.append(mid_x)
            ys.append(mid_y)

    if not xs:
        return {"x": round(insert_pos.x, 4), "y": round(insert_pos.y, 4)}

    # The block geometry is in block-local coordinates; the INSERT offset
    # shifts them into modelspace.  (In our case INSERT is at (0,0) but
    # the geometry already carries absolute coords, so this still works.)
    cx = sum(xs) / len(xs) + insert_pos.x
    cy = sum(ys) / len(ys) + insert_pos.y
    return {"x": round(cx, 4), "y": round(cy, 4)}


def extract_attach_blocks(dxf_path: str | Path) -> dict[str, dict[str, float]]:
    doc = ezdxf.readfile(str(dxf_path))
    msp = doc.modelspace()
    result: dict[str, dict[str, float]] = {}

    for entity in msp.query("INSERT"):
        name = entity.dxf.name
        matched = (
            name
            if name in ALL_KNOWN_BLOCKS
            else next(
                (block for block in ALL_KNOWN_BLOCKS if block.upper() == name.upper()),
                None,
            )
        )
        if matched:
            result[matched] = _block_crosshair_centre(doc, name, entity.dxf.insert)
    return result


def extract_component_attach(dxf_path: str | Path, category: str) -> dict:
    blocks = extract_attach_blocks(dxf_path)
    primary_block = CATEGORY_PRIMARY_BLOCK.get(category)
    if primary_block is None:
        raise ValueError(f"Unknown category: {category}")

    data: dict[str, object] = {
        "attach_primary": blocks.get(primary_block),
        "attach_block_name": primary_block,
    }
    # Secondary attach point (e.g. ST_Attach2 for seat_tube → defines movement axis)
    secondary_block = CATEGORY_SECONDARY_BLOCK.get(category)
    if secondary_block:
        data["attach_secondary"] = blocks.get(secondary_block)
        data["attach_secondary_block_name"] = secondary_block if blocks.get(secondary_block) else None

    if category == "head_tube":
        data["pa_default"] = blocks.get("PA")
        data["pb_default"] = blocks.get("PB")
    return data


def extract_skeleton_nodes(dxf_path: str | Path) -> dict[str, dict[str, float]]:
    blocks = extract_attach_blocks(dxf_path)
    nodes = {k: v for k, v in blocks.items() if k in SKELETON_ATTACH_BLOCKS}
    missing = SKELETON_ATTACH_BLOCKS - set(nodes.keys())
    if missing:
        print(f"[WARN] Missing skeleton blocks in {dxf_path}: {sorted(missing)}")
    return nodes


def batch_extract_all(output_json: str | Path | None = None) -> dict:
    output_json = Path(output_json or settings.attach_points_json)
    output_json.parent.mkdir(parents=True, exist_ok=True)

    dxf_root = Path(settings.dxf_source_dir)
    dwg_root = Path(settings.allowed_source_dir)

    all_results: dict[str, dict] = {}

    for vehicle_name, parts in VEHICLES.items():
        folder = parts["_folder"]
        vehicle_dxf_dir = dxf_root / folder
        vehicle_dwg_dir = dwg_root / folder
        all_results[vehicle_name] = {}

        skeleton_file = parts["_skeleton"]
        skeleton_dxf = vehicle_dxf_dir / to_dxf_name(skeleton_file)
        skeleton_dwg = vehicle_dwg_dir / skeleton_file

        if skeleton_dxf.exists():
            try:
                nodes = extract_skeleton_nodes(skeleton_dxf)
                all_results[vehicle_name]["_skeleton"] = {
                    "dwg_path": str(skeleton_dwg),
                    "dwg_filename": skeleton_file,
                    "dxf_path": str(skeleton_dxf),
                    "nodes": nodes,
                }
                print(f"[OK] {vehicle_name} / skeleton")
            except Exception as exc:
                all_results[vehicle_name]["_skeleton"] = {"error": str(exc)}
                print(f"[ERR] {vehicle_name} / skeleton: {exc}")
        else:
            all_results[vehicle_name]["_skeleton"] = {
                "error": f"File not found: {skeleton_dxf}"
            }
            print(f"[MISS] {vehicle_name} / skeleton: {skeleton_dxf}")

        for category, filename in parts.items():
            if category.startswith("_"):
                continue

            dxf_path = vehicle_dxf_dir / to_dxf_name(filename)
            dwg_path = vehicle_dwg_dir / filename
            if not dxf_path.exists():
                all_results[vehicle_name][category] = {
                    "error": f"File not found: {dxf_path}"
                }
                print(f"[MISS] {vehicle_name} / {category}: {dxf_path}")
                continue

            try:
                data = extract_component_attach(dxf_path, category)
                data["dwg_filename"] = filename
                data["dwg_path"] = str(dwg_path)
                data["dxf_path"] = str(dxf_path)
                all_results[vehicle_name][category] = data
                print(f"[OK] {vehicle_name} / {category}")
            except Exception as exc:
                all_results[vehicle_name][category] = {"error": str(exc)}
                print(f"[ERR] {vehicle_name} / {category}: {exc}")

    output_json.write_text(
        json.dumps(all_results, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nDone. Output: {output_json}")
    return all_results


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extract known attach blocks from converted DXF files"
    )
    parser.add_argument(
        "--output-json",
        default=settings.attach_points_json,
        help="Path to output extraction JSON",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    batch_extract_all(output_json=args.output_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
