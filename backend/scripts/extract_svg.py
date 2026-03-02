from __future__ import annotations

import argparse
import math
from pathlib import Path

import ezdxf

from backend.config import settings
from backend.scripts.vehicle_spec import ALL_KNOWN_BLOCKS, VEHICLES


def to_dxf_name(filename: str) -> str:
    return f"{Path(filename).stem}.dxf"


def _svg_line(entity) -> tuple[str, list[float], list[float]]:
    start = entity.dxf.start
    end = entity.dxf.end
    element = (
        f'<line x1="{start.x:.2f}" y1="{-start.y:.2f}" '
        f'x2="{end.x:.2f}" y2="{-end.y:.2f}" '
        'stroke="black" stroke-width="0.8" fill="none"/>'
    )
    return element, [start.x, end.x], [-start.y, -end.y]


def _svg_lwpolyline(entity) -> tuple[str, list[float], list[float]]:
    points = list(entity.get_points())
    if len(points) < 2:
        return "", [], []
    path = "M " + " L ".join(f"{p[0]:.2f} {-p[1]:.2f}" for p in points)
    if entity.closed:
        path += " Z"
    element = f'<path d="{path}" stroke="black" stroke-width="0.8" fill="none"/>'
    xs = [p[0] for p in points]
    ys = [-p[1] for p in points]
    return element, xs, ys


def _svg_arc(entity) -> tuple[str, list[float], list[float]]:
    cx = entity.dxf.center.x
    cy = -entity.dxf.center.y
    radius = entity.dxf.radius
    start_angle = entity.dxf.start_angle
    end_angle = entity.dxf.end_angle

    sx = cx + radius * math.cos(math.radians(start_angle))
    sy = cy - radius * math.sin(math.radians(start_angle))
    ex = cx + radius * math.cos(math.radians(end_angle))
    ey = cy - radius * math.sin(math.radians(end_angle))
    large_arc = 1 if (end_angle - start_angle) % 360 > 180 else 0

    element = (
        f'<path d="M {sx:.2f} {sy:.2f} A {radius:.2f} {radius:.2f} 0 {large_arc} 0 {ex:.2f} {ey:.2f}" '
        'stroke="black" stroke-width="0.8" fill="none"/>'
    )
    xs = [sx, ex, cx - radius, cx + radius]
    ys = [sy, ey, cy - radius, cy + radius]
    return element, xs, ys


def _svg_circle(entity) -> tuple[str, list[float], list[float]]:
    cx = entity.dxf.center.x
    cy = -entity.dxf.center.y
    radius = entity.dxf.radius
    element = (
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{radius:.2f}" '
        'stroke="black" stroke-width="0.8" fill="none"/>'
    )
    xs = [cx - radius, cx + radius]
    ys = [cy - radius, cy + radius]
    return element, xs, ys


def _svg_ellipse(entity) -> tuple[str, list[float], list[float]]:
    center = entity.dxf.center
    major = entity.dxf.major_axis
    ratio = entity.dxf.ratio
    rx = math.hypot(major.x, major.y)
    ry = rx * ratio
    rotation_deg = math.degrees(math.atan2(major.y, major.x))

    cx = center.x
    cy = -center.y
    element = (
        f'<ellipse cx="{cx:.2f}" cy="{cy:.2f}" rx="{rx:.2f}" ry="{ry:.2f}" '
        f'transform="rotate({-rotation_deg:.2f} {cx:.2f} {cy:.2f})" '
        'stroke="black" stroke-width="0.8" fill="none"/>'
    )
    xs = [cx - rx, cx + rx]
    ys = [cy - ry, cy + ry]
    return element, xs, ys


def _svg_spline(entity) -> tuple[str, list[float], list[float]]:
    """Approximate a SPLINE by flattening it into a polyline using ezdxf."""
    try:
        points = list(entity.flattening(distance=0.5))  # tolerance 0.5 DXF units
    except Exception:
        return "", [], []
    if len(points) < 2:
        return "", [], []
    d = "M " + " L ".join(f"{p[0]:.2f} {-p[1]:.2f}" for p in points)
    element = f'<path d="{d}" stroke="black" stroke-width="0.8" fill="none"/>'
    xs = [p[0] for p in points]
    ys = [-p[1] for p in points]
    return element, xs, ys


def extract_svg_preview(dxf_path: str | Path, padding: int = 20) -> str:
    skip_layers = {name.upper() for name in ALL_KNOWN_BLOCKS}

    doc = ezdxf.readfile(str(dxf_path))
    msp = doc.modelspace()

    # ── Pass 1: collect all NON-circle/arc geometry to get a reference bbox ──
    # This lets us reject over-sized circles that 3D→2D DWG export leaves behind
    # (bounding-profile circles, cross-section outlines, etc.).
    ref_xs: list[float] = []
    ref_ys: list[float] = []
    for entity in msp:
        if entity.dxf.hasattr("layer") and entity.dxf.layer.upper() in skip_layers:
            continue
        etype = entity.dxftype()
        if etype == "LINE":
            _, exs, eys = _svg_line(entity)
        elif etype == "LWPOLYLINE":
            _, exs, eys = _svg_lwpolyline(entity)
        elif etype == "SPLINE":
            _, exs, eys = _svg_spline(entity)
        else:
            continue
        ref_xs.extend(exs)
        ref_ys.extend(eys)

    # Max dimension of real geometry; fall back to a large value so circles are
    # always kept when there is no reference line geometry at all.
    if ref_xs and ref_ys:
        ref_dim = max(
            max(ref_xs) - min(ref_xs),
            max(ref_ys) - min(ref_ys),
            1.0,
        )
    else:
        ref_dim = float("inf")
    # Circles/arcs with radius > this fraction of the reference dimension are
    # treated as construction geometry and dropped.
    MAX_RADIUS_RATIO = 0.15
    max_allowed_radius = ref_dim * MAX_RADIUS_RATIO

    # ── Pass 2: build SVG elements, skipping oversized circles/arcs ──────────
    elements: list[str] = []
    xs: list[float] = []
    ys: list[float] = []

    for entity in msp:
        if entity.dxf.hasattr("layer") and entity.dxf.layer.upper() in skip_layers:
            continue

        entity_type = entity.dxftype()
        if entity_type == "LINE":
            element, exs, eys = _svg_line(entity)
        elif entity_type == "LWPOLYLINE":
            element, exs, eys = _svg_lwpolyline(entity)
        elif entity_type == "ARC":
            radius = entity.dxf.radius
            if radius > max_allowed_radius:
                continue
            element, exs, eys = _svg_arc(entity)
        elif entity_type == "CIRCLE":
            radius = entity.dxf.radius
            if radius > max_allowed_radius:
                continue
            element, exs, eys = _svg_circle(entity)
        elif entity_type == "ELLIPSE":
            major = entity.dxf.major_axis
            rx = math.hypot(major.x, major.y)
            if rx > max_allowed_radius:
                continue
            element, exs, eys = _svg_ellipse(entity)
        elif entity_type == "SPLINE":
            element, exs, eys = _svg_spline(entity)
        else:
            continue

        if element:
            elements.append(element)
            xs.extend(exs)
            ys.extend(eys)

    if not elements:
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>'

    view_x = min(xs) - padding
    view_y = min(ys) - padding
    view_w = max(xs) - min(xs) + padding * 2
    view_h = max(ys) - min(ys) + padding * 2

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="{view_x:.2f} {view_y:.2f} {view_w:.2f} {view_h:.2f}">'
        + "\n"
        + "\n".join(elements)
        + "\n</svg>"
    )


def batch_extract_svg() -> None:
    dxf_root = Path(settings.dxf_source_dir)
    svg_root = Path(settings.svg_output_dir)

    total = 0
    failed = 0

    for vehicle, parts in VEHICLES.items():
        folder = parts["_folder"]
        vehicle_dxf_dir = dxf_root / folder
        vehicle_svg_dir = svg_root / vehicle
        vehicle_svg_dir.mkdir(parents=True, exist_ok=True)

        skeleton_file = parts["_skeleton"]
        skeleton_dxf = vehicle_dxf_dir / to_dxf_name(skeleton_file)
        skeleton_svg = vehicle_svg_dir / "skeleton.svg"
        try:
            skeleton_svg.write_text(extract_svg_preview(skeleton_dxf), encoding="utf-8")
            total += 1
            print(f"[OK] {vehicle} / skeleton")
        except Exception as exc:
            failed += 1
            print(f"[ERR] {vehicle} / skeleton: {exc}")

        for category, filename in parts.items():
            if category.startswith("_"):
                continue

            dxf_path = vehicle_dxf_dir / to_dxf_name(filename)
            svg_path = vehicle_svg_dir / f"{category}.svg"
            try:
                svg_path.write_text(extract_svg_preview(dxf_path), encoding="utf-8")
                total += 1
                print(f"[OK] {vehicle} / {category}")
            except Exception as exc:
                failed += 1
                print(f"[ERR] {vehicle} / {category}: {exc}")

    print(f"\nDone. generated={total}, failed={failed}")


def build_parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(
        description="Batch extract SVG preview from DXF source files"
    )


def main() -> int:
    _ = build_parser().parse_args()
    batch_extract_svg()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
