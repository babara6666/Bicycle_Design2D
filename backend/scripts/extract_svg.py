from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Iterable

import ezdxf

from backend.config import settings
from backend.scripts.vehicle_spec import ALL_KNOWN_BLOCKS, VEHICLES


RELAXED_ARC_SOURCE_NAMES = {"awh-nde-a.dxf", "asel-g4.dxf"}
RELAXED_ELLIPSE_SOURCE_NAMES = {"awh-nde-a.dxf"}


def to_dxf_name(filename: str) -> str:
    return f"{Path(filename).stem}.dxf"


def _to_float(value, default: float = 1.0) -> float:
    try:
        v = float(value)
        if math.isfinite(v):
            return v
    except Exception:
        pass
    return default


def _flatten_distance(source_name: str) -> float:
    if source_name in {"awh-nde-a.dxf", "asel-g4.dxf"}:
        return 0.1
    return 0.2


def _resolve_linetype_name(entity, doc) -> str:
    ltype = ""
    if entity.dxf.hasattr("linetype"):
        ltype = (entity.dxf.linetype or "").strip()

    if not ltype or ltype.upper() in {"BYLAYER", "BYBLOCK"}:
        layer_name = entity.dxf.layer if entity.dxf.hasattr("layer") else ""
        if layer_name:
            try:
                layer = doc.layers.get(layer_name)
                ltype = (layer.dxf.linetype or "").strip()
            except Exception:
                pass

    if not ltype or ltype.upper() in {"BYLAYER", "BYBLOCK"}:
        return "CONTINUOUS"
    return ltype.upper()


def _linetype_dash_pattern(linetype_name: str) -> list[float] | None:
    name = linetype_name.upper()
    if name in {"CONTINUOUS", "BYLAYER", "BYBLOCK"}:
        return None
    if "CENTERX2" in name:
        return [16.0, 4.0, 2.0, 4.0]
    if "CENTER" in name:
        return [8.0, 2.0, 1.0, 2.0]
    if "HIDDEN" in name:
        return [6.0, 3.0]
    if "DASHDOT" in name:
        return [8.0, 3.0, 1.5, 3.0]
    if "PHANTOM" in name:
        return [12.0, 3.0, 3.0, 3.0, 3.0, 3.0]
    if "DOTTED" in name or name == "DOT":
        return [1.2, 2.4]
    if "DASH" in name:
        return [8.0, 3.0]
    return None


def _stroke_attrs(entity, doc) -> str:
    attrs = (
        'stroke="black" stroke-width="0.8" fill="none" '
        'vector-effect="non-scaling-stroke"'
    )
    ltype_name = _resolve_linetype_name(entity, doc)
    pattern = _linetype_dash_pattern(ltype_name)
    if not pattern:
        return attrs

    entity_scale = (
        _to_float(entity.dxf.ltscale, 1.0) if entity.dxf.hasattr("ltscale") else 1.0
    )
    global_scale = _to_float(doc.header.get("$LTSCALE", 1.0), 1.0)
    scale = max(0.1, min(entity_scale * global_scale, 20.0))
    dash = " ".join(f"{(seg * scale):.2f}" for seg in pattern)
    return f'{attrs} stroke-dasharray="{dash}"'


def _svg_line(entity, doc) -> tuple[str, list[float], list[float]]:
    start = entity.dxf.start
    end = entity.dxf.end
    stroke = _stroke_attrs(entity, doc)
    element = (
        f'<line x1="{start.x:.2f}" y1="{-start.y:.2f}" '
        f'x2="{end.x:.2f}" y2="{-end.y:.2f}" '
        f"{stroke}/>"
    )
    return element, [start.x, end.x], [-start.y, -end.y]


def _svg_lwpolyline(entity, doc) -> tuple[str, list[float], list[float]]:
    points = list(entity.get_points())
    if len(points) < 2:
        return "", [], []
    path = "M " + " L ".join(f"{p[0]:.2f} {-p[1]:.2f}" for p in points)
    if entity.closed:
        path += " Z"
    stroke = _stroke_attrs(entity, doc)
    element = f'<path d="{path}" {stroke}/>'
    xs = [p[0] for p in points]
    ys = [-p[1] for p in points]
    return element, xs, ys


def _polyline_points(entity) -> Iterable[tuple[float, float]]:
    if hasattr(entity, "points"):
        for p in entity.points():
            yield float(p[0]), float(p[1])
        return

    if hasattr(entity, "vertices"):
        for v in entity.vertices:
            loc = v.dxf.location
            yield float(loc.x), float(loc.y)


def _is_polyline_closed(entity) -> bool:
    if hasattr(entity, "is_closed"):
        try:
            return bool(entity.is_closed)
        except Exception:
            pass
    if entity.dxf.hasattr("flags"):
        return bool(entity.dxf.flags & 1)
    return False


def _svg_polyline(entity, doc) -> tuple[str, list[float], list[float]]:
    points = list(_polyline_points(entity))
    if len(points) < 2:
        return "", [], []
    path = "M " + " L ".join(f"{x:.2f} {-y:.2f}" for x, y in points)
    if _is_polyline_closed(entity):
        path += " Z"
    stroke = _stroke_attrs(entity, doc)
    element = f'<path d="{path}" {stroke}/>'
    xs = [p[0] for p in points]
    ys = [-p[1] for p in points]
    return element, xs, ys


def _svg_arc(entity, doc) -> tuple[str, list[float], list[float]]:
    cx = entity.dxf.center.x
    cy = -entity.dxf.center.y
    radius = entity.dxf.radius
    start_angle = entity.dxf.start_angle
    end_angle = entity.dxf.end_angle
    span = (end_angle - start_angle) % 360 or 360.0

    sx = cx + radius * math.cos(math.radians(start_angle))
    sy = cy - radius * math.sin(math.radians(start_angle))
    ex = cx + radius * math.cos(math.radians(end_angle))
    ey = cy - radius * math.sin(math.radians(end_angle))
    large_arc = 1 if span > 180 else 0
    sweep = 1

    stroke = _stroke_attrs(entity, doc)
    element = (
        f'<path d="M {sx:.2f} {sy:.2f} A {radius:.2f} {radius:.2f} 0 {large_arc} {sweep} {ex:.2f} {ey:.2f}" '
        f"{stroke}/>"
    )
    xs = [sx, ex, cx - radius, cx + radius]
    ys = [sy, ey, cy - radius, cy + radius]
    return element, xs, ys


def _svg_circle(entity, doc) -> tuple[str, list[float], list[float]]:
    cx = entity.dxf.center.x
    cy = -entity.dxf.center.y
    radius = entity.dxf.radius
    stroke = _stroke_attrs(entity, doc)
    element = (
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{radius:.2f}" '
        f"{stroke}/>"
    )
    xs = [cx - radius, cx + radius]
    ys = [cy - radius, cy + radius]
    return element, xs, ys


def _svg_ellipse(entity, doc, flatten_distance: float = 0.2) -> tuple[str, list[float], list[float]]:
    try:
        points = list(entity.flattening(distance=flatten_distance))
    except Exception:
        return "", [], []
    if len(points) < 2:
        return "", [], []

    path = "M " + " L ".join(f"{p[0]:.2f} {-p[1]:.2f}" for p in points)
    if _ellipse_span(entity) >= math.tau - 1e-3:
        path += " Z"
    stroke = _stroke_attrs(entity, doc)
    element = f'<path d="{path}" {stroke}/>'
    xs = [p[0] for p in points]
    ys = [-p[1] for p in points]
    return element, xs, ys


def _svg_spline(entity, doc, flatten_distance: float = 0.2) -> tuple[str, list[float], list[float]]:
    try:
        points = list(entity.flattening(distance=flatten_distance))
    except Exception:
        return "", [], []
    if len(points) < 2:
        return "", [], []
    d = "M " + " L ".join(f"{p[0]:.2f} {-p[1]:.2f}" for p in points)
    stroke = _stroke_attrs(entity, doc)
    element = f'<path d="{d}" {stroke}/>'
    xs = [p[0] for p in points]
    ys = [-p[1] for p in points]
    return element, xs, ys


def _is_construction_circle(radius: float, ref_dim: float) -> bool:
    if ref_dim == float("inf"):
        return False
    return radius > ref_dim * 0.03


def _cluster_circle_key(cx: float, cy: float) -> tuple[float, float]:
    return (round(cx / 1.5) * 1.5, round(cy / 1.5) * 1.5)


def _cluster_arc_key(cx: float, cy: float) -> tuple[float, float]:
    return (round(cx / 2.0) * 2.0, round(cy / 2.0) * 2.0)


def _build_arc_skip_handles(msp, skip_layers: set[str], ref_dim: float) -> set[str]:
    return set()


def _build_ellipse_skip_handles(msp, skip_layers: set[str], ref_dim: float) -> set[str]:
    return set()


def _build_circle_keep_handles(msp, skip_layers: set[str], ref_dim: float) -> set[str]:
    families: dict[tuple[float, float], list[tuple[str, float]]] = {}
    dedup: set[tuple[float, float, float]] = set()

    for entity in msp:
        if entity.dxftype() != "CIRCLE":
            continue
        if entity.dxf.hasattr("layer") and entity.dxf.layer.upper() in skip_layers:
            continue

        cx = float(entity.dxf.center.x)
        cy = float(entity.dxf.center.y)
        radius = float(entity.dxf.radius)
        if _is_construction_circle(radius, ref_dim):
            continue

        dedup_key = (round(cx, 2), round(cy, 2), round(radius, 2))
        if dedup_key in dedup:
            continue
        dedup.add(dedup_key)

        family_key = _cluster_circle_key(cx, cy)
        families.setdefault(family_key, []).append((entity.dxf.handle, radius))

    keep_handles: set[str] = set()
    for family in families.values():
        ordered = sorted(family, key=lambda item: item[1])
        keep_handles.add(ordered[0][0])

    return keep_handles


def _bbox_margin(ref_dim: float) -> float:
    if ref_dim == float("inf"):
        return 0.0
    return max(ref_dim * 0.04, 8.0)


def _center_outside_bbox(cx: float, cy: float, ref_bbox: tuple[float, float, float, float], margin: float) -> bool:
    min_x, max_x, min_y, max_y = ref_bbox
    return cx < min_x - margin or cx > max_x + margin or cy < min_y - margin or cy > max_y + margin


def _is_construction_arc(entity, ref_dim: float, ref_bbox: tuple[float, float, float, float], source_name: str = "") -> bool:
    if ref_dim == float("inf"):
        return False
    radius = float(entity.dxf.radius)
    span = (float(entity.dxf.end_angle) - float(entity.dxf.start_angle)) % 360 or 360.0
    cx = float(entity.dxf.center.x)
    cy = -float(entity.dxf.center.y)
    if source_name in RELAXED_ARC_SOURCE_NAMES:
        return radius > ref_dim * 40.0
    if _center_outside_bbox(cx, cy, ref_bbox, _bbox_margin(ref_dim)) and radius > ref_dim * 0.3:
        return True
    if radius > ref_dim * 6.0:
        return True
    if _center_outside_bbox(cx, cy, ref_bbox, _bbox_margin(ref_dim) * 3.0) and radius > ref_dim * 1.2 and span < 8.0:
        return True
    return False


def _ellipse_span(entity) -> float:
    start = float(entity.dxf.start_param)
    end = float(entity.dxf.end_param)
    return (end - start) % (math.tau) or math.tau


def _is_construction_ellipse(entity, ref_dim: float, ref_bbox: tuple[float, float, float, float], source_name: str = "") -> bool:
    if ref_dim == float("inf"):
        return False
    major = entity.dxf.major_axis
    rx = math.hypot(major.x, major.y)
    span = _ellipse_span(entity)
    cx = float(entity.dxf.center.x)
    cy = -float(entity.dxf.center.y)
    if source_name in RELAXED_ELLIPSE_SOURCE_NAMES:
        relaxed_outside = _center_outside_bbox(cx, cy, ref_bbox, _bbox_margin(ref_dim) * 8.0)
        if rx <= ref_dim * 1.4 and not relaxed_outside:
            return False
    if _center_outside_bbox(cx, cy, ref_bbox, _bbox_margin(ref_dim)) and rx > ref_dim * 0.12:
        return True
    if rx > ref_dim * 4.0:
        return True
    if _center_outside_bbox(cx, cy, ref_bbox, _bbox_margin(ref_dim) * 2.5) and rx > ref_dim * 0.5 and span < 0.2:
        return True
    return False


def extract_svg_preview(dxf_path: str | Path, padding: int = 20) -> str:
    skip_layers = {name.upper() for name in ALL_KNOWN_BLOCKS}

    doc = ezdxf.readfile(str(dxf_path))
    msp = doc.modelspace()
    source_name = Path(dxf_path).name.lower()
    flatten_distance = _flatten_distance(source_name)

    ref_xs: list[float] = []
    ref_ys: list[float] = []
    for entity in msp:
        if entity.dxf.hasattr("layer") and entity.dxf.layer.upper() in skip_layers:
            continue
        etype = entity.dxftype()
        if etype == "LINE":
            _, exs, eys = _svg_line(entity, doc)
        elif etype == "LWPOLYLINE":
            _, exs, eys = _svg_lwpolyline(entity, doc)
        elif etype == "POLYLINE":
            _, exs, eys = _svg_polyline(entity, doc)
        elif etype == "SPLINE":
            _, exs, eys = _svg_spline(entity, doc, flatten_distance)
        else:
            continue
        ref_xs.extend(exs)
        ref_ys.extend(eys)

    if ref_xs and ref_ys:
        min_x = min(ref_xs)
        max_x = max(ref_xs)
        min_y = min(ref_ys)
        max_y = max(ref_ys)
        ref_dim = max(
            max_x - min_x,
            max_y - min_y,
            1.0,
        )
        ref_bbox = (min_x, max_x, min_y, max_y)
    else:
        ref_dim = float("inf")
        ref_bbox = (float("-inf"), float("inf"), float("-inf"), float("inf"))

    keep_circle_handles = _build_circle_keep_handles(msp, skip_layers, ref_dim)
    skip_arc_handles = _build_arc_skip_handles(msp, skip_layers, ref_dim)
    skip_ellipse_handles = _build_ellipse_skip_handles(msp, skip_layers, ref_dim)

    elements: list[str] = []
    xs: list[float] = []
    ys: list[float] = []

    for entity in msp:
        if entity.dxf.hasattr("layer") and entity.dxf.layer.upper() in skip_layers:
            continue

        entity_type = entity.dxftype()
        if entity_type == "LINE":
            element, exs, eys = _svg_line(entity, doc)
        elif entity_type == "LWPOLYLINE":
            element, exs, eys = _svg_lwpolyline(entity, doc)
        elif entity_type == "POLYLINE":
            element, exs, eys = _svg_polyline(entity, doc)
        elif entity_type == "ARC":
            if entity.dxf.handle in skip_arc_handles:
                continue
            if _is_construction_arc(entity, ref_dim, ref_bbox, source_name):
                continue
            element, exs, eys = _svg_arc(entity, doc)
        elif entity_type == "CIRCLE":
            if entity.dxf.handle not in keep_circle_handles:
                continue
            element, exs, eys = _svg_circle(entity, doc)
        elif entity_type == "ELLIPSE":
            if entity.dxf.handle in skip_ellipse_handles:
                continue
            if _is_construction_ellipse(entity, ref_dim, ref_bbox, source_name):
                continue
            element, exs, eys = _svg_ellipse(entity, doc, flatten_distance)
        elif entity_type == "SPLINE":
            element, exs, eys = _svg_spline(entity, doc, flatten_distance)
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
