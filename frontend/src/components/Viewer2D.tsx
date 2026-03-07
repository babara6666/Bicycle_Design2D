import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { CATEGORY_LABELS, CATEGORY_NODE_MAP } from "../constants";
import type { Category, ComponentDetail, Point, SkeletonDetail } from "../types";

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 5.5;
const ZOOM_STEP = 1.1;
const VIEW_W = 1200;
const VIEW_H = 840;
const FIT_PADDING = 0.8;

export interface AiOverlay {
  /** data:image/png;base64,... */
  imageDataUrl: string;
  /** CENTER of the overlay in outer render space (zoom/pan, no skeleton shift) */
  position: Point;
  /** Clockwise rotation in degrees */
  rotation: number;
  /** Uniform scale multiplier */
  scale: number;
  /** Horizontal mirror (left-right flip) */
  flipX: boolean;
  /** Natural image width in render units (set from img.naturalWidth on load) */
  naturalW: number;
  /** Natural image height in render units */
  naturalH: number;
}

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
  showSkeleton: boolean;
  hiddenCategories?: Set<Category>;
  aiOverlays?: Partial<Record<Category, AiOverlay>>;
  selectedAiCategory?: Category | null;
  onToggleSkeletonVisibility: () => void;
  onSelectCategory: (category: Category) => void;
  onSelectAiCategory?: (category: Category) => void;
  onClearAiSelection?: () => void;
  onSetPaPosition: (point: Point) => void;
  onSetPbPosition: (point: Point) => void;
  onMoveCategory: (category: Category, worldPos: Point) => void;
  onMoveAiOverlay?: (category: Category, position: Point) => void;
  onUpdateAiOverlay?: (category: Category, updates: Partial<Pick<AiOverlay, "rotation" | "scale" | "flipX">>) => void;
  onRemoveAiOverlay?: (category: Category) => void;
}

export interface Viewer2DHandle {
  fitToContent: () => void;
  getSvgElement: () => SVGSVGElement | null;
}

interface ParsedSvg {
  inner: string;
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

export const Viewer2D = forwardRef<Viewer2DHandle, Viewer2DProps>(function Viewer2D({
  skeleton,
  components,
  categoryPositions,
  categoryAngles,
  selectedCategory,
  isFreeMode,
  headTubeAngleDeg,
  paPosition,
  pbPosition,
  showSkeleton,
  hiddenCategories,
  aiOverlays,
  selectedAiCategory,
  onToggleSkeletonVisibility,
  onSelectCategory,
  onSelectAiCategory,
  onClearAiSelection,
  onSetPaPosition,
  onSetPbPosition,
  onMoveCategory,
  onMoveAiOverlay,
  onUpdateAiOverlay,
  onRemoveAiOverlay,
}: Viewer2DProps, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgElementRef = useRef<SVGSVGElement | null>(null);
  const [offset, setOffset] = useState({ x: 600, y: 420 });
  const [zoom, setZoom] = useState(0.5);
  const hasCenteredRef = useRef(false);

  const parsedSkeleton = useMemo(() => parseSvg(skeleton?.preview_svg), [skeleton?.preview_svg]);

  const parsedParts = useMemo(() => {
    return components.reduce<Record<number, ParsedSvg | null>>((acc, component) => {
      acc[component.id] = parseSvg(component.preview_svg);
      return acc;
    }, {});
  }, [components]);

  const nodeMarkers = Object.entries(skeleton?.nodes ?? {}) as [string, Point][];
  const sparseDataMode =
    nodeMarkers.every(([, point]) => isNearZero(point)) ||
    components.every((component) => isNearZero(component.attach_primary));

  const fitToContent = () => {
    const vb = parsedSkeleton?.viewBox;
    const shiftX = vb ? -(vb.x + vb.w / 2) : 0;
    const shiftY = vb ? -(vb.y + vb.h / 2) : 0;

    const renderPoints: Point[] = [];

    for (const [, point] of nodeMarkers) {
      if (!isNearZero(point)) {
        renderPoints.push({ x: point.x + shiftX, y: -point.y + shiftY });
      }
    }

    if (renderPoints.length === 0) {
      for (const component of components) {
        const parsed = parsedParts[component.id];
        if (!parsed?.viewBox) continue;
        const box = parsed.viewBox;
        renderPoints.push(
          { x: box.x + shiftX, y: box.y + shiftY },
          { x: box.x + box.w + shiftX, y: box.y + box.h + shiftY },
        );
      }
    }

    if (renderPoints.length === 0) {
      setZoom(0.5);
      setOffset({ x: VIEW_W / 2, y: VIEW_H / 2 });
      return;
    }

    const xs = renderPoints.map((point) => point.x);
    const ys = renderPoints.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bboxW = maxX - minX || 1;
    const bboxH = maxY - minY || 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const fitZoom = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, Math.min((VIEW_W * FIT_PADDING) / bboxW, (VIEW_H * FIT_PADDING) / bboxH)),
    );

    setZoom(fitZoom);
    setOffset({
      x: VIEW_W / 2 - cx * fitZoom,
      y: VIEW_H / 2 - cy * fitZoom,
    });
  };

  useImperativeHandle(ref, () => ({
    fitToContent,
    getSvgElement: () => svgElementRef.current,
  }), [parsedSkeleton, nodeMarkers, components, parsedParts]);

  useEffect(() => {
    if (!skeleton || hasCenteredRef.current) return;
    const nodes = Object.values(skeleton.nodes) as Point[];
    if (nodes.length === 0 || nodes.every((n) => Math.abs(n.x) < 1e-6 && Math.abs(n.y) < 1e-6)) {
      return;
    }
    hasCenteredRef.current = true;
    fitToContent();
  }, [skeleton, parsedSkeleton, nodeMarkers, components, parsedParts]);

  const panStateRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });
  const dragPointRef = useRef<"PA" | "PB" | null>(null);
  const dragPointAnchorRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const dragCategoryRef = useRef<Category | null>(null);
  const dragAiOverlayRef = useRef<{ category: Category; anchorDx: number; anchorDy: number } | null>(null);
  const dragRotateRef = useRef<{ category: Category; cx: number; cy: number; startAngle: number; startRotation: number } | null>(null);
  const dragScaleRef  = useRef<{ category: Category; cx: number; cy: number; startDist: number; startScale: number } | null>(null);

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
    // Clicking the canvas background clears the AI overlay selection
    onClearAiSelection?.();
    panStateRef.current = { active: true, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const vb = parsedSkeleton?.viewBox;
    const shiftX = vb ? -(vb.x + vb.w / 2) : 0;
    const shiftY = vb ? -(vb.y + vb.h / 2) : 0;
    const renderX = (screenX - offset.x) / zoom - shiftX;
    const renderY = (screenY - offset.y) / zoom - shiftY;
    const worldPoint = { x: renderX, y: -renderY };

    if (dragPointRef.current) {
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

    if (dragRotateRef.current && onUpdateAiOverlay) {
      const { category, cx, cy, startAngle, startRotation } = dragRotateRef.current;
      const rx = (screenX - offset.x) / zoom;
      const ry = (screenY - offset.y) / zoom;
      const angle = Math.atan2(ry - cy, rx - cx) * (180 / Math.PI);
      onUpdateAiOverlay(category, { rotation: startRotation + (angle - startAngle) });
      return;
    }

    if (dragScaleRef.current && onUpdateAiOverlay) {
      const { category, cx, cy, startDist, startScale } = dragScaleRef.current;
      const rx = (screenX - offset.x) / zoom;
      const ry = (screenY - offset.y) / zoom;
      const dist = Math.sqrt((rx - cx) ** 2 + (ry - cy) ** 2);
      if (dist > 0 && startDist > 0) {
        const newScale = Math.max(0.05, Math.min(20, startScale * dist / startDist));
        onUpdateAiOverlay(category, { scale: newScale });
      }
      return;
    }

    if (dragAiOverlayRef.current && onMoveAiOverlay) {
      const { category, anchorDx, anchorDy } = dragAiOverlayRef.current;
      // Outer render coords: (screen - offset) / zoom  (no skeleton shift)
      const rx = (screenX - offset.x) / zoom;
      const ry = (screenY - offset.y) / zoom;
      onMoveAiOverlay(category, { x: rx - anchorDx, y: ry - anchorDy });
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
    dragAiOverlayRef.current = null;
    dragRotateRef.current = null;
    dragScaleRef.current = null;
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

    const svg = event.currentTarget.ownerSVGElement;
    if (svg) {
      svg.setPointerCapture(event.pointerId);
    }
  };

  const beginDragCategory = (event: React.PointerEvent<SVGGElement>, category: Category) => {
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
    const vb = parsedSkeleton?.viewBox;
    const shiftX = vb ? -(vb.x + vb.w / 2) : 0;
    const shiftY = vb ? -(vb.y + vb.h / 2) : 0;
    return {
      x: offset.x + (render.x + shiftX) * zoom,
      y: offset.y + (render.y + shiftY) * zoom,
    };
  };

  return (
    <div className="viewer-shell" ref={containerRef}>
      <svg
        ref={svgElementRef}
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
          <g transform={skeletonCentreTransform(parsedSkeleton?.viewBox ?? null)}>
            {showSkeleton && parsedSkeleton ? (
              <g
                className="skeleton-layer"
                opacity={0.45}
                dangerouslySetInnerHTML={{ __html: parsedSkeleton.inner }}
              />
            ) : null}

            {components.map((component) => {
              const parsed = parsedParts[component.id];
              if (!parsed || !skeleton) return null;
              if (hiddenCategories?.has(component.category)) return null;

              const isSelected = selectedCategory === component.category;

              if (sparseDataMode) {
                return (
                  <g
                    key={component.id}
                    className={`part-layer ${isSelected ? "selected" : ""}`}
                    data-category={component.category}
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

              const attachNodeName = CATEGORY_NODE_MAP[component.category];
              let node: Point | null;
              if (component.category === "top_tube") {
                node = isFreeMode
                  ? categoryPositions.top_tube ?? paPosition ?? null
                  : paPosition;
              } else if (component.category === "down_tube") {
                node = isFreeMode
                  ? categoryPositions.down_tube ?? pbPosition ?? null
                  : pbPosition;
              } else {
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
                  data-category={component.category}
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

            {showSkeleton
              ? nodeMarkers.map(([name, point]) => {
                  const renderPoint = worldToRender(point);
                  return (
                    <g key={name} className="attach-node">
                      <circle cx={renderPoint.x} cy={renderPoint.y} r={1.8} />
                    </g>
                  );
                })
              : null}
          </g>

          {/* AI-generated part overlays — outer render space, position = CENTER */}
          {aiOverlays
            ? Object.entries(aiOverlays).map(([cat, overlay]) => {
                if (!overlay) return null;
                const category = cat as Category;
                const isSelected = selectedAiCategory === category;
                const OW = overlay.naturalW; // actual image width in render units
                const OH = overlay.naturalH; // actual image height in render units
                const { x: cx, y: cy } = overlay.position;
                const s      = overlay.scale;
                const rotDeg = overlay.rotation;
                const flipX  = overlay.flipX;
                const rotRad = rotDeg * (Math.PI / 180);

                // Rotation handle: 60 render-units above center, rotated with overlay
                const rHandleDist = 60 / zoom;
                const rhx = cx + rHandleDist * Math.cos(rotRad - Math.PI / 2);
                const rhy = cy + rHandleDist * Math.sin(rotRad - Math.PI / 2);

                // Scale handle: bottom-right corner of the scaled+rotated overlay
                const scx = (OW / 2) * s;
                const scy = (OH / 2) * s;
                const shx = cx + scx * Math.cos(rotRad) - scy * Math.sin(rotRad);
                const shy = cy + scx * Math.sin(rotRad) + scy * Math.cos(rotRad);

                const handleR = 9 / zoom;
                const strokeW = 1.5 / zoom;

                return (
                  <g key={`ai-overlay-${cat}`} data-ai-overlay="true">
                    {/* Main image — drag to move */}
                    <g
                      transform={`translate(${cx},${cy}) rotate(${rotDeg}) scale(${s}) translate(${-OW / 2},${-OH / 2})`}
                      style={{ cursor: "grab" }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.stopPropagation();
                        onSelectAiCategory?.(category);
                        const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
                        const px = (event.clientX - rect.left - offset.x) / zoom;
                        const py = (event.clientY - rect.top  - offset.y) / zoom;
                        dragAiOverlayRef.current = { category, anchorDx: px - cx, anchorDy: py - cy };
                        event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
                      }}
                      onDoubleClick={() => onRemoveAiOverlay?.(category)}
                    >
                      {/* flipX: mirror around the image centre */}
                      <g transform={flipX ? `translate(${OW},0) scale(-1,1)` : undefined}>
                        <image
                          href={overlay.imageDataUrl}
                          x={0} y={0} width={OW} height={OH}
                          preserveAspectRatio="xMidYMid meet"
                          opacity={isSelected ? 1 : 0.85}
                        />
                        {/* Border + label only when selected */}
                        {isSelected ? (
                          <rect
                            x={0} y={0} width={OW} height={OH}
                            fill="none"
                            stroke="#2a7fff"
                            strokeWidth={strokeW}
                          />
                        ) : null}
                      </g>
                    </g>

                    {/* Label — only when selected */}
                    {isSelected ? (
                      <text
                        x={cx} y={cy - (OH / 2) * s - 8 / zoom}
                        textAnchor="middle" fontSize={11 / zoom} fill="#2a7fff"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        AI: {CATEGORY_LABELS[category]} · double-click to remove
                      </text>
                    ) : null}

                    {/* Controls — only when selected */}
                    {isSelected ? (
                      <>
                        {/* Rotation handle line */}
                        <line
                          x1={cx} y1={cy} x2={rhx} y2={rhy}
                          stroke="#2a7fff" strokeWidth={strokeW}
                          style={{ pointerEvents: "none" }}
                        />
                        {/* Rotation handle circle */}
                        <circle
                          cx={rhx} cy={rhy} r={handleR}
                          fill="#2a7fff" stroke="white" strokeWidth={strokeW}
                          style={{ cursor: "crosshair" }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
                            const px = (event.clientX - rect.left - offset.x) / zoom;
                            const py = (event.clientY - rect.top  - offset.y) / zoom;
                            dragRotateRef.current = {
                              category, cx, cy,
                              startAngle: Math.atan2(py - cy, px - cx) * (180 / Math.PI),
                              startRotation: rotDeg,
                            };
                            event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
                          }}
                        />
                        {/* Scale handle */}
                        <circle
                          cx={shx} cy={shy} r={handleR}
                          fill="#ff6b35" stroke="white" strokeWidth={strokeW}
                          style={{ cursor: "se-resize" }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
                            const px = (event.clientX - rect.left - offset.x) / zoom;
                            const py = (event.clientY - rect.top  - offset.y) / zoom;
                            const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
                            dragScaleRef.current = {
                              category, cx, cy,
                              startDist: dist || 1,
                              startScale: s,
                            };
                            event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
                          }}
                        />
                        {/* Flip button (⇆) — onPointerDown so pointer capture doesn't block it */}
                        <g
                          transform={`translate(${cx + (OW / 2) * s + 16 / zoom}, ${cy})`}
                          style={{ cursor: "pointer" }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onUpdateAiOverlay?.(category, { flipX: !flipX });
                          }}
                        >
                          <rect
                            x={0} y={-12 / zoom}
                            width={28 / zoom} height={24 / zoom}
                            rx={4 / zoom}
                            fill={flipX ? "#2a7fff" : "#eee"}
                            stroke="#2a7fff" strokeWidth={strokeW}
                          />
                          <text
                            x={14 / zoom} y={5 / zoom}
                            textAnchor="middle" fontSize={14 / zoom}
                            fill={flipX ? "white" : "#2a7fff"}
                            style={{ pointerEvents: "none", userSelect: "none", fontWeight: "bold" }}
                          >
                            ⇆
                          </text>
                        </g>

                      </>
                    ) : null}
                  </g>
                );
              })
            : null}
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

      <div className="viewer-toolbar">
        <button
          type="button"
          className={`viewer-toggle ${showSkeleton ? "active" : ""}`}
          onClick={onToggleSkeletonVisibility}
        >
          {showSkeleton ? "Hide Skeleton" : "Show Skeleton"}
        </button>
      </div>

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
