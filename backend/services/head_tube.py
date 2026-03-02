from __future__ import annotations

import math
import shutil
from pathlib import Path
from typing import NamedTuple


class LocalPoint(NamedTuple):
    x: float
    y: float


def _backup_if_needed(dxf_path: Path) -> None:
    """One-time backup: creates {stem}_original{suffix} alongside the DXF.

    Never overwrites an existing backup so the pristine original is preserved
    across multiple confirm-PA/PB calls.
    """
    backup = dxf_path.with_stem(dxf_path.stem + "_original")
    if not backup.exists():
        shutil.copy2(dxf_path, backup)


def compute_local_pa_pb(
    pa_world: tuple[float, float],
    pb_world: tuple[float, float],
    ht_attach_world: tuple[float, float],
    ht_attach_local: tuple[float, float],
    angle_deg: float,
) -> tuple[LocalPoint, LocalPoint]:
    """Convert world-space PA / PB positions into head-tube local coordinates.

    The head tube sits at ``ht_attach_world`` in the world frame and is
    rotated by ``angle_deg`` degrees (CCW positive, same convention as DXF).

    World → local transform:
        local_delta = R(-angle_deg) × (world_pos - ht_attach_world)
        local_pos   = local_delta + ht_attach_local

    R(-θ) = [[cos θ,  sin θ],
              [-sin θ, cos θ]]
    """
    theta = math.radians(angle_deg)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)

    def _to_local(wx: float, wy: float) -> LocalPoint:
        dx = wx - ht_attach_world[0]
        dy = wy - ht_attach_world[1]
        lx = cos_t * dx + sin_t * dy + ht_attach_local[0]
        ly = -sin_t * dx + cos_t * dy + ht_attach_local[1]
        return LocalPoint(round(lx, 4), round(ly, 4))

    return _to_local(*pa_world), _to_local(*pb_world)


def update_pa_pb_in_dxf(
    dxf_path: Path,
    pa_local: LocalPoint,
    pb_local: LocalPoint,
) -> None:
    """Write PA / PB block-insert positions into the head-tube DXF.

    * Creates a one-time ``_original`` backup before the first mutation.
    * Ensures block definitions ``PA`` and ``PB`` exist (adds a small circle
      as geometry if they need to be created).
    * Removes all existing PA / PB INSERT entities from model-space.
    * Adds fresh INSERT entities at the supplied local coordinates.
    """
    import ezdxf  # lazy import — backend-only, not needed by frontend tests

    _backup_if_needed(dxf_path)

    doc = ezdxf.readfile(str(dxf_path))
    msp = doc.modelspace()

    # Ensure block definitions exist (create if absent)
    for block_name in ("PA", "PB"):
        if block_name not in doc.blocks:
            blk = doc.blocks.new(block_name)
            # A tiny cross marker so the block is visually distinguishable
            blk.add_circle((0, 0, 0), radius=2.0, dxfattribs={"color": 1})

    # Remove stale PA / PB inserts from model-space
    stale = [
        entity
        for entity in msp
        if entity.dxftype() == "INSERT" and entity.dxf.name in ("PA", "PB")
    ]
    for entity in stale:
        msp.delete_entity(entity)

    # Insert at updated positions
    msp.add_blockref("PA", insert=(pa_local.x, pa_local.y, 0.0))
    msp.add_blockref("PB", insert=(pb_local.x, pb_local.y, 0.0))

    doc.saveas(str(dxf_path))
