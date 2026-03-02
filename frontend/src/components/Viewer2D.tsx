import { forwardRef, useEffect, useMemo, useRef, useState } from "react";

import { CATEGORY_LABELS, CATEGORY_NODE_MAP } from "../constants";
import type { Category, ComponentDetail, Point, SkeletonDetail } from "../types";

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 5.5;
const ZOOM_STEP = 1.1;

interface Viewer2DProps {
  skeleton: SkeletonDetail | null;
  components: ComponentDetail[];
  categoryPositions: Partial<Record<Category, Point>>;
  categoryAngles: Partial<Record<Category, number>>;
  selectedCategory: Category;
  isFreeMode: boolean;
  headTubeAngleDeg: number;
  paPosition: Point | null;
  pbPosition: Point | null;
  onSelectCategory: (category: Category) => void;
  onSetPaPosition: (point: Point) => void;
  onSetPbPosition: (point: Point) => void;
  onMoveCategory: (category: Category, worldPos: Point) => void;
}

interface ParsedSvg {
  inner: string;
  /** Parsed viewBox from the original SVG element, if present. */
  viewBox: { x: number; y: number; w: number; h: number } | null;
}

interface RenderTransform {
  tx: number;
  ty: number;
  angleDeg: number;
}

function parseSvg(svgPayload: string | null | undefined): ParsedSvg | null {
  if (!svgPayload) {
    return null;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgPayload, "image/svg+xml");
  const svgEl = doc.documentElement;
  if (!svgEl) {
    return null;
  }

  let viewBox: ParsedSvg["viewBox"] = null;
  const vbAttr = svgEl.getAttribute("viewBox");
  if (vbAttr) {
    const parts = vbAttr.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => isFinite(n))) {
      viewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
    }
  }

  return { inner: svgEl.innerHTML, viewBox };
}

/**
 * Build a SVG transform string that moves the skeleton (which lives in DXF
 * coordinate space) so its visual centre lands at render-space (0, 0).
 * The viewer's world→render transform already flips Y, but the skeleton paths
 * were extracted with y-negated values so they are already in render space —
 * we only need to translate their centre to the origin.
 */
function skeletonCentreTransform(vb: ParsedSvg["viewBox"]): string {
  if (!vb) return "";
  const cx = vb.x + vb.w / 2;
  const cy = vb.y + vb.h / 2;
  return `translate(${-cx}, ${-cy})`;
}

function worldToRender(point: Point): Point {
  return { x: point.x, y: -point.y };
}

function isNearZero(point: Point | null | undefined): boolean {
  if (!point) return true;
  return Math.abs(point.x) < 1e-6 && Math.abs(point.y) < 1e-6;
}

function computeRenderTransform(
  worldNode: Point,
  attachRender: Point,
  angleWorldDeg: number,
): RenderTransform {
  const node = worldToRender(worldNode);
  const angleDeg = -angleWorldDeg;
  const radians = (angleDeg * Math.PI) / 180;

  const rotatedAttachX =
    attachRender.x * Math.cos(radians) - attachRender.y * Math.sin(radians);
  const rotatedAttachY =
    attachRender.x * Math.sin(radians) + attachRender.y * Math.cos(radians);

  return {
    tx: node.x - rotatedAttachX,
    ty: node.y - rotatedAttachY,
    angleDeg,
  };
}

export const Viewer2D = forwardRef<SVGSVGElement, Viewer2DProps>(function Viewer2D({
  skeleton,
  components,
  categoryPositions,
  categoryAngles,
  selectedCategory,
  isFreeMode,
  headTubeAngleDeg,
  paPosition,
  pbPosition,
  onSelectCategory,
  onSetPaPosition,
  onSetPbPosition,
  onMoveCategory,
}: Viewer2DProps, svgRef) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ x: 600, y: 420 });
  const [zoom, setZoom] = useState(0.5);
  const hasCenteredRef = useRef(false);

  // Declared early so the auto-center useEffect below can reference it
  const parsedSkeleton = useMemo(() => parseSvg(skeleton?.preview_svg), [skeleton?.preview_svg]);

  // Auto-centre camera on skeleton nodes when skeleton first loads.
  // Must also account for the skeletonCentreShift that is applied to the world
  // layer (the SVG viewBox centre is translated to render-space origin).
  useEffect(() => {
    if (!skeleton || hasCenteredRef.current) return;
    const nodes = Object.values(skeleton.nodes) as Point[];
    if (nodes.length === 0 || nodes.every((n) => Math.abs(n.x) < 1e-6 && Math.abs(n.y) < 1e-6)) {
      return;
    }
    hasCenteredRef.current = true;

    // skeletonCentreShift that the world-layer <g> applies
    const vb = parsedSkeleton?.viewBox;
    const shiftX = vb ? -(vb.x + vb.w / 2) : 0;
    const shiftY = vb ? -(vb.y + vb.h / 2) : 0;

    // Node positions in the shifted render space
    const xs = nodes.map((n) => n.x + shiftX);
    const ys = nodes.map((n) => -n.y + shiftY); // render-space Y is negated
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bboxW = maxX - minX || 1;
    const bboxH = maxY - minY || 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const VIEW_W = 1200;
    const VIEW_H = 840;
    const padding = 0.8; // 80% of viewport for content
    const fitZoom = Math.min((VIEW_W * padding) / bboxW, (VIEW_H * padding) / bboxH);

    setZoom(fitZoom);
    setOffset({
      x: VIEW_W / 2 - cx * fitZoom,
      y: VIEW_H / 2 - cy * fitZoom,
    });
  }, [skeleton, parsedSkeleton]);

  const panStateRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });
  const dragPointRef = useRef<"PA" | "PB" | null>(null);
  // Offset (in world coords) between pointer click-down and the dot's world position.
  // We subtract this on every move so the dot doesn't jump to the cursor tip.
  const dragPointAnchorRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dragCategoryRef = useRef<Category | null>(null);


  const parsedParts = useMemo(() => {
    return components.reduce<Record<number, ParsedSvg | null>>((acc, component) => {
      acc[component.id] = parseSvg(component.preview_svg);
      return acc;
    }, {});
  }, [components]);

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    const zoomFactor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * zoomFactor));

    const renderX = (pointerX - offset.x) / zoom;
    const renderY = (pointerY - offset.y) / zoom;

    setOffset({
      x: pointerX - renderX * nextZoom,
      y: pointerY - renderY * nextZoom,
    });
    setZoom(nextZoom);
  };

  const onCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType !== "touch") {
      return;
    }
    panStateRef.current = { active: true, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();

    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    // Undo skeletonCentreShift to get back to true world-render coords
    const vb = parsedSkeleton?.viewBox;
    const shiftX = vb ? -(vb.x + vb.w / 2) : 0;
    const shiftY = vb ? -(vb.y + vb.h / 2) : 0;
    const renderX = (screenX - offset.x) / zoom - shiftX;
    const renderY = (screenY - offset.y) / zoom - shiftY;
    const worldPoint = { x: renderX, y: -renderY };

    if (dragPointRef.current) {
      // Subtract the anchor offset so the dot stays under the grab point
      const adjustedPoint = {
        x: worldPoint.x - dragPointAnchorRef.current.dx,
        y: worldPoint.y - dragPointAnchorRef.current.dy,
      };
      if (dragPointRef.current === "PA") {
        onSetPaPosition(adjustedPoint);
      } else {
        onSetPbPosition(adjustedPoint);
      }
      return;
    }

    if (dragCategoryRef.current) {
      onMoveCategory(dragCategoryRef.current, worldPoint);
      return;
    }

    if (!panStateRef.current.active) {
      return;
    }

    const dx = event.clientX - panStateRef.current.x;
    const dy = event.clientY - panStateRef.current.y;

    panStateRef.current = { active: true, x: event.clientX, y: event.clientY };
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const onCanvasPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    panStateRef.current.active = false;
    dragPointRef.current = null;
    dragCategoryRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const beginDragPoint = (
    event: React.PointerEvent<SVGCircleElement>,
    pointName: "PA" | "PB",
    currentWorldPos: Point,
  ) => {
    event.stopPropagation();
    dragPointRef.current = pointName;
    panStateRef.current.active = false;

    // Compute the world position of the pointer click so we can derive the
    // grab-offset and keep the dot under the cursor throughout the drag.
    const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const vb = parsedSkeleton?.viewBox;
    const shiftX = vb ? -(vb.x + vb.w / 2) : 0;
    const shiftY = vb ? -(vb.y + vb.h / 2) : 0;
    const clickWorld = {
      x: (screenX - offset.x) / zoom - shiftX,
      y: -((screenY - offset.y) / zoom - shiftY),
    };
    dragPointAnchorRef.current = {
      dx: clickWorld.x - currentWorldPos.x,
      dy: clickWorld.y - currentWorldPos.y,
    };

    // Capture on the SVG so onCanvasPointerMove always fires — even outside the circle
    const svg = event.currentTarget.ownerSVGElement;
    if (svg) {
      svg.setPointerCapture(event.pointerId);
    }
  };

  const beginDragCategory = (
    event: React.PointerEvent<SVGGElement>,
    category: Category,
  ) => {
    const canMove = isFreeMode || category === "seat_tube";
    if (!canMove) {
      return;
    }

    event.stopPropagation();
    dragCategoryRef.current = category;

    const svg = event.currentTarget.ownerSVGElement;
    if (svg) {
      svg.setPointerCapture(event.pointerId);
    }
  };

  const toScreen = (point: Point): Point => {
    const render = worldToRender(point);
    // Must account for the skeletonCentreShift applied to the world layer
    const vb = parsedSkeleton?.viewBox;
    const shiftX = vb ? -(vb.x + vb.w / 2) : 0;
    const shiftY = vb ? -(vb.y + vb.h / 2) : 0;
    return {
      x: offset.x + (render.x + shiftX) * zoom,
      y: offset.y + (render.y + shiftY) * zoom,
    };
  };

  const nodeMarkers = Object.entries(skeleton?.nodes ?? {}) as [string, Point][];
  const sparseDataMode =
    nodeMarkers.every(([, point]) => isNearZero(point)) ||
    components.every((component) => isNearZero(component.attach_primary));

  return (
    <div className="viewer-shell" ref={containerRef}>
      <svg
        ref={svgRef}
        className="viewer-canvas"
        onWheel={handleWheel}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerUp}
        viewBox="0 0 1200 840"
      >
        <defs>
          <pattern id="grid-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(16, 31, 46, 0.08)" />
          </pattern>
        </defs>

        <rect width="1200" height="840" fill="url(#grid-pattern)" />

        <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
          {/* skeletonCentreShift 套在整個 world layer，讓 skeleton、
              components、node markers 全部在同一個偏移空間對齊 */}
          <g transform={skeletonCentreTransform(parsedSkeleton?.viewBox ?? null)}>
          {parsedSkeleton ? (
            <g
              className="skeleton-layer"
              opacity={0.45}
              dangerouslySetInnerHTML={{ __html: parsedSkeleton.inner }}
            />
          ) : null}

          {components.map((component) => {
            const parsed = parsedParts[component.id];
            if (!parsed || !skeleton) {
              return null;
            }

            const isSelected = selectedCategory === component.category;

            // ── Sparse/demo data mode ─────────────────────────────────────
            // attach_primary and skeleton nodes are (0,0) placeholders.
            // Components share the same DXF coordinate space as the skeleton.
            // The outer skeletonCentreShift group already centres everything;
            // no extra transform needed here.
            if (sparseDataMode) {
              return (
                <g
                  key={component.id}
                  className={`part-layer ${isSelected ? "selected" : ""}`}
                  opacity={isSelected ? 1 : 0.5}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectCategory(component.category);
                  }}
                >
                  <title>{CATEGORY_LABELS[component.category]}</title>
                  <g dangerouslySetInnerHTML={{ __html: parsed.inner }} />
                </g>
              );
            }

            // ── Normal mode: real attach coordinates ──────────────────────
            // Mapping rules:
            //   head_tube  : HT_attach  → skeleton HT_Attach
            //   top_tube   : TT_attach  → head tube's PA (paPosition)
            //   down_tube  : DT_attach  → head tube's PB (pbPosition)
            //   seat_tube  : ST_attach  → skeleton ST_Attach
            //   seat_stay  : SS_attach  → skeleton SS_Attach
            //   chain_stay : CS_attach  → skeleton CS_Attach
            //   motor_mount: Motor_attach → skeleton Motor_Attach
            const attachNodeName = CATEGORY_NODE_MAP[component.category];
            let node: Point | null;
            if (component.category === "top_tube") {
              // TT_attach goes to head tube PA — not a skeleton node
              node = isFreeMode
                ? categoryPositions.top_tube ?? paPosition ?? null
                : paPosition;
            } else if (component.category === "down_tube") {
              // DT_attach goes to head tube PB — not a skeleton node
              node = isFreeMode
                ? categoryPositions.down_tube ?? pbPosition ?? null
                : pbPosition;
            } else {
              // All other parts: attach goes to the corresponding skeleton node
              node = categoryPositions[component.category] ?? skeleton.nodes[attachNodeName] ?? null;
            }
            if (!node) {
              return null;
            }

            const angle = component.category === "head_tube"
              ? headTubeAngleDeg
              : (categoryAngles[component.category] ?? 0);
            const attachRender = worldToRender(component.attach_primary as Point);
            const transform = computeRenderTransform(node, attachRender, angle);

            return (
              <g
                key={component.id}
                className={`part-layer ${isSelected ? "selected" : ""}`}
                transform={`translate(${transform.tx} ${transform.ty}) rotate(${transform.angleDeg})`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectCategory(component.category);
                  beginDragCategory(event, component.category);
                }}
              >
                <title>{CATEGORY_LABELS[component.category]}</title>
                <g dangerouslySetInnerHTML={{ __html: parsed.inner }} />
              </g>
            );
          })}

          {nodeMarkers.map(([name, point]) => {
            const renderPoint = worldToRender(point);
            return (
              <g key={name} className="attach-node">
                <circle cx={renderPoint.x} cy={renderPoint.y} r={1.8} />
              </g>
            );
          })}
          </g> {/* end skeletonCentreShift layer */}
        </g>

        {paPosition ? (
          <g className="control-point pa-point">
            <circle
              cx={toScreen(paPosition).x}
              cy={toScreen(paPosition).y}
              r={22}
              fill="transparent"
              onPointerDown={(event) => beginDragPoint(event, "PA", paPosition)}
            />
            <circle cx={toScreen(paPosition).x} cy={toScreen(paPosition).y} r={8} />
            <text x={toScreen(paPosition).x + 12} y={toScreen(paPosition).y - 12}>
              PA
            </text>
          </g>
        ) : null}

        {pbPosition ? (
          <g className="control-point pb-point">
            <circle
              cx={toScreen(pbPosition).x}
              cy={toScreen(pbPosition).y}
              r={22}
              fill="transparent"
              onPointerDown={(event) => beginDragPoint(event, "PB", pbPosition)}
            />
            <circle cx={toScreen(pbPosition).x} cy={toScreen(pbPosition).y} r={8} />
            <text x={toScreen(pbPosition).x + 12} y={toScreen(pbPosition).y - 12}>
              PB
            </text>
          </g>
        ) : null}
      </svg>

      <div className="viewer-hint">
        <p>
          Wheel to zoom, drag canvas to pan. Top/down tube anchors follow PA/PB in constrained mode;
          drag seat tube (or any part in free mode).
        </p>
        {sparseDataMode ? (
          <p>
            Demo data mode: attach coordinates are placeholders, so only the selected part is shown to avoid exploded placement.
          </p>
        ) : null}
      </div>
    </div>
  );
});
