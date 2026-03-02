import { REQUIRED_NODES } from "../constants";
import type { AxisLock, Point } from "../types";

interface GeometryPanelProps {
  headTubeAngleDeg: number;
  paPosition: Point | null;
  pbPosition: Point | null;
  seatTubePosition: Point | null;
  seatTubeAxisLock: AxisLock;
  isFreeMode: boolean;
  missingNodes: string[];
  onHeadTubeAngleChange: (angle: number) => void;
  onPaPositionChange: (point: Point) => void;
  onPbPositionChange: (point: Point) => void;
  onSeatTubePositionChange: (point: Point) => void;
  onSeatTubeAxisLockChange: (axis: AxisLock) => void;
  onConfirmPaPb: () => void;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "";
  }
  return value.toFixed(2);
}

function parseOrFallback(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function GeometryPanel({
  headTubeAngleDeg,
  paPosition,
  pbPosition,
  seatTubePosition,
  seatTubeAxisLock,
  isFreeMode,
  missingNodes,
  onHeadTubeAngleChange,
  onPaPositionChange,
  onPbPositionChange,
  onSeatTubePositionChange,
  onSeatTubeAxisLockChange,
  onConfirmPaPb,
}: GeometryPanelProps) {
  const pa = paPosition ?? { x: 0, y: 0 };
  const pb = pbPosition ?? { x: 0, y: 0 };
  const seatTube = seatTubePosition ?? { x: 0, y: 0 };
  const hasMissingNodes = missingNodes.length > 0;
  const disableSeatX = !isFreeMode && seatTubeAxisLock === "vertical";
  const disableSeatY = !isFreeMode && seatTubeAxisLock === "horizontal";

  return (
    <section className="panel-card">
      <div className="panel-heading">
        <h2>Geometry</h2>
        <p>Head tube angle, PA/PB control, and seat tube axis lock.</p>
      </div>

      <div className="field-group">
        <label htmlFor="head-angle">Head Tube Angle ({headTubeAngleDeg.toFixed(1)} deg)</label>
        <input
          id="head-angle"
          type="range"
          min={-25}
          max={25}
          step={0.1}
          value={headTubeAngleDeg}
          onChange={(event) => onHeadTubeAngleChange(Number(event.target.value))}
        />
        <small className="field-note">Auto-updated from PA/PB line, but can still be fine-tuned.</small>
      </div>

      <div className="point-grid">
        <h3>PA</h3>
        <label>
          X
          <input
            type="number"
            value={formatNumber(pa.x)}
            onChange={(event) =>
              onPaPositionChange({ x: parseOrFallback(event.target.value, pa.x), y: pa.y })
            }
          />
        </label>
        <label>
          Y
          <input
            type="number"
            value={formatNumber(pa.y)}
            onChange={(event) =>
              onPaPositionChange({ x: pa.x, y: parseOrFallback(event.target.value, pa.y) })
            }
          />
        </label>
      </div>

      <div className="point-grid">
        <h3>PB</h3>
        <label>
          X
          <input
            type="number"
            value={formatNumber(pb.x)}
            onChange={(event) =>
              onPbPositionChange({ x: parseOrFallback(event.target.value, pb.x), y: pb.y })
            }
          />
        </label>
        <label>
          Y
          <input
            type="number"
            value={formatNumber(pb.y)}
            onChange={(event) =>
              onPbPositionChange({ x: pb.x, y: parseOrFallback(event.target.value, pb.y) })
            }
          />
        </label>
      </div>

      <div className="field-group">
        <button
          className="btn-confirm-pa-pb"
          type="button"
          disabled={!paPosition || !pbPosition}
          onClick={onConfirmPaPb}
          title="Write current PA/PB positions back to the head tube DXF and update the database."
        >
          Confirm PA/PB — Write to DXF
        </button>
        <small className="field-note">
          Saves PA/PB into the working DXF. A one-time backup is created automatically.
        </small>
      </div>

      <div className="field-group">
        <label>Seat Tube Axis Lock</label>
        <div className="axis-switch" role="radiogroup" aria-label="Seat tube axis lock">
          <button
            className={seatTubeAxisLock === "vertical" ? "active" : ""}
            onClick={() => onSeatTubeAxisLockChange("vertical")}
            type="button"
          >
            Vertical
          </button>
          <button
            className={seatTubeAxisLock === "horizontal" ? "active" : ""}
            onClick={() => onSeatTubeAxisLockChange("horizontal")}
            type="button"
          >
            Horizontal
          </button>
        </div>
      </div>

      <div className="point-grid">
        <h3>Seat Tube Position</h3>
        <label>
          X
          <input
            disabled={disableSeatX}
            type="number"
            value={formatNumber(seatTube.x)}
            onChange={(event) =>
              onSeatTubePositionChange({
                x: parseOrFallback(event.target.value, seatTube.x),
                y: seatTube.y,
              })
            }
          />
        </label>
        <label>
          Y
          <input
            disabled={disableSeatY}
            type="number"
            value={formatNumber(seatTube.y)}
            onChange={(event) =>
              onSeatTubePositionChange({
                x: seatTube.x,
                y: parseOrFallback(event.target.value, seatTube.y),
              })
            }
          />
        </label>
      </div>

      {isFreeMode ? (
        <div className="status-banner warning">
          Free mode is active. Constraints are intentionally bypassed.
        </div>
      ) : null}

      {hasMissingNodes ? (
        <div className="status-banner caution">
          Missing skeleton nodes: {missingNodes.join(", ")}. Required set: {REQUIRED_NODES.join(", ")}.
        </div>
      ) : (
        <div className="status-banner success">Skeleton attach nodes are complete.</div>
      )}
    </section>
  );
}
