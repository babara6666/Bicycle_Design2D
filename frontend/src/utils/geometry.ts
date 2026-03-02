import type { AxisLock, ComponentDetail, Point } from "../types";

const DEG_PER_RAD = 180 / Math.PI;
const RAD_PER_DEG = Math.PI / 180;

export interface PaPbWorldResult {
  pa: Point;
  pb: Point;
}

function rotate(point: Point, angleDeg: number): Point {
  const radians = angleDeg * RAD_PER_DEG;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

export function normalizeAngle(angleDeg: number): number {
  let value = angleDeg;
  while (value > 180) {
    value -= 360;
  }
  while (value < -180) {
    value += 360;
  }
  return value;
}

export function angleBetween(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.atan2(dy, dx) * DEG_PER_RAD;
}

export function computePaPbWorldFromHeadTube(
  headTubeWorld: Point,
  headTube: ComponentDetail | undefined,
  angleDeg: number,
): PaPbWorldResult | null {
  if (!headTube?.attach_primary || !headTube.pa_default || !headTube.pb_default) {
    return null;
  }

  const attach = headTube.attach_primary;
  const paOffset = {
    x: headTube.pa_default.x - attach.x,
    y: headTube.pa_default.y - attach.y,
  };
  const pbOffset = {
    x: headTube.pb_default.x - attach.x,
    y: headTube.pb_default.y - attach.y,
  };

  const paRotated = rotate(paOffset, angleDeg);
  const pbRotated = rotate(pbOffset, angleDeg);

  return {
    pa: {
      x: Number((headTubeWorld.x + paRotated.x).toFixed(4)),
      y: Number((headTubeWorld.y + paRotated.y).toFixed(4)),
    },
    pb: {
      x: Number((headTubeWorld.x + pbRotated.x).toFixed(4)),
      y: Number((headTubeWorld.y + pbRotated.y).toFixed(4)),
    },
  };
}

export function computeHeadTubeAngleFromPaPb(
  paWorld: Point,
  pbWorld: Point,
  headTube: ComponentDetail | undefined,
): number {
  const worldAngle = angleBetween(pbWorld, paWorld);

  if (!headTube?.pa_default || !headTube.pb_default) {
    return normalizeAngle(worldAngle);
  }

  const localAngle = angleBetween(headTube.pb_default, headTube.pa_default);
  return normalizeAngle(worldAngle - localAngle);
}

export function applyAxisConstraint(
  newPos: Point,
  axis: AxisLock,
  fixedValue: number,
): Point {
  if (axis === "vertical") {
    return { x: fixedValue, y: newPos.y };
  }
  return { x: newPos.x, y: fixedValue };
}

/**
 * Project newPos onto the infinite line through `origin` in `direction`.
 * Used for ST_Attach2: seat tube can only slide along ST_Attach→ST_Attach2 axis.
 */
export function applyVectorConstraint(
  newPos: Point,
  origin: Point,
  direction: Point,
): Point {
  const dx = direction.x - origin.x;
  const dy = direction.y - origin.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) {
    return origin; // degenerate: same point, return origin
  }
  // t = dot(newPos - origin, dir) / |dir|^2
  const t = ((newPos.x - origin.x) * dx + (newPos.y - origin.y) * dy) / lenSq;
  return {
    x: Number((origin.x + t * dx).toFixed(4)),
    y: Number((origin.y + t * dy).toFixed(4)),
  };
}
