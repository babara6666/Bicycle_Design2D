import { create } from "zustand";

import { CATEGORY_NODE_MAP, CATEGORY_ORDER } from "../constants";
import {
  confirmComponentPaPb,
  createConfiguration,
  fetchComponentDetail,
  fetchComponents,
  fetchConfiguration,
  fetchSkeletonById,
  fetchSkeletonByVehicle,
  patchConfigurationConstraints,
} from "../services/api";
import type {
  AxisLock,
  Category,
  ComponentDetail,
  ComponentListItem,
  ConfigurationComponentRef,
  Point,
  SkeletonDetail,
  Vehicle,
} from "../types";
import {
  applyAxisConstraint,
  computeHeadTubeAngleFromPaPb,
  computePaPbWorldFromHeadTube,
} from "../utils/geometry";

type SelectedComponentMap = Partial<Record<Category, number>>;
type CategoryPositionMap = Partial<Record<Category, Point>>;

interface EditorState {
  vehicle: Vehicle;
  skeleton: SkeletonDetail | null;
  catalog: ComponentListItem[];
  componentDetails: Record<number, ComponentDetail>;
  selectedComponentIds: SelectedComponentMap;
  selectedCategory: Category;
  configurationId: number | null;
  configurationNote: string | null;
  paPosition: Point | null;
  pbPosition: Point | null;
  categoryPositions: CategoryPositionMap;
  categoryAngles: Partial<Record<Category, number>>;
  headTubeAngleDeg: number;
  seatTubeAxisLock: AxisLock;
  isFreeMode: boolean;
  isLoading: boolean;
  error: string | null;
  initialize: (vehicle?: Vehicle) => Promise<void>;
  setVehicle: (vehicle: Vehicle) => Promise<void>;
  selectCategory: (category: Category) => void;
  selectComponent: (category: Category, componentId: number) => Promise<void>;
  setPaPosition: (point: Point) => void;
  setPbPosition: (point: Point) => void;
  setHeadTubeAngleDeg: (angle: number) => void;
  setCategoryPosition: (category: Category, worldPos: Point) => void;
  setCategoryAngle: (category: Category, angleDeg: number) => void;
  nudgeCategory: (category: Category, dx: number, dy: number) => void;
  resetCategoryToDefault: (category: Category) => void;
  setSeatTubeAxisLock: (axis: AxisLock) => void;
  toggleFreeMode: () => void;
  saveNewConfiguration: (name?: string) => Promise<void>;
  updateConfigurationConstraints: () => Promise<void>;
  loadConfiguration: (configurationId: number) => Promise<void>;
  confirmPaPb: () => Promise<void>;
}

function chooseDefaultByCategory(catalog: ComponentListItem[]): SelectedComponentMap {
  const selected: SelectedComponentMap = {};
  for (const category of CATEGORY_ORDER) {
    const first = catalog.find((item) => item.category === category);
    if (first) {
      selected[category] = first.id;
    }
  }
  return selected;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
}

function buildCategoryPositions(skeleton: SkeletonDetail | null): CategoryPositionMap {
  if (!skeleton) {
    return {};
  }
  const positions: CategoryPositionMap = {};
  for (const category of CATEGORY_ORDER) {
    const nodeName = CATEGORY_NODE_MAP[category];
    const node = skeleton.nodes[nodeName];
    if (node) {
      positions[category] = { x: node.x, y: node.y };
    }
  }
  return positions;
}

function syncTubeAnchors(
  positions: CategoryPositionMap,
  paPosition: Point | null,
  pbPosition: Point | null,
): CategoryPositionMap {
  const next = { ...positions };
  if (paPosition) {
    next.top_tube = { x: paPosition.x, y: paPosition.y };
  }
  if (pbPosition) {
    next.down_tube = { x: pbPosition.x, y: pbPosition.y };
  }
  return next;
}

function getHeadTubeComponent(state: {
  selectedComponentIds: SelectedComponentMap;
  componentDetails: Record<number, ComponentDetail>;
}): ComponentDetail | undefined {
  const headTubeId = state.selectedComponentIds.head_tube;
  return headTubeId ? state.componentDetails[headTubeId] : undefined;
}

function refsFromSelected(selected: SelectedComponentMap): ConfigurationComponentRef[] {
  const refs: ConfigurationComponentRef[] = [];
  for (const category of CATEGORY_ORDER) {
    const componentId = selected[category];
    if (componentId) {
      refs.push({ category, component_id: componentId });
    }
  }
  return refs;
}

function parsePoint(value: unknown): Point | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function parseSeatTubeAxisLock(value: unknown): AxisLock {
  if (!value || typeof value !== "object") {
    return "vertical";
  }
  const axis = (value as Record<string, unknown>).axis_lock;
  return axis === "horizontal" ? "horizontal" : "vertical";
}

function parseOverrideHeadAngle(overrides: unknown): number {
  if (!overrides || typeof overrides !== "object") {
    return 0;
  }
  const raw = Number((overrides as Record<string, unknown>).head_tube_angle_deg);
  return Number.isFinite(raw) ? raw : 0;
}

function parseOverrideFreeMode(overrides: unknown): boolean {
  if (!overrides || typeof overrides !== "object") {
    return false;
  }
  return Boolean((overrides as Record<string, unknown>).free_mode);
}

function parseOverrideCategoryPositions(overrides: unknown): CategoryPositionMap {
  if (!overrides || typeof overrides !== "object") {
    return {};
  }
  const rawPositions = (overrides as Record<string, unknown>).category_positions;
  if (!rawPositions || typeof rawPositions !== "object") {
    return {};
  }

  const parsed: CategoryPositionMap = {};
  for (const category of CATEGORY_ORDER) {
    const point = parsePoint((rawPositions as Record<string, unknown>)[category]);
    if (point) {
      parsed[category] = point;
    }
  }
  return parsed;
}

function buildSelectedFromConfiguration(
  catalog: ComponentListItem[],
  refs: ConfigurationComponentRef[],
): SelectedComponentMap {
  const byCategory: SelectedComponentMap = {};
  for (const ref of refs) {
    if (CATEGORY_ORDER.includes(ref.category) && catalog.some((item) => item.id === ref.component_id)) {
      byCategory[ref.category] = ref.component_id;
    }
  }

  for (const category of CATEGORY_ORDER) {
    if (!byCategory[category]) {
      const fallback = catalog.find((item) => item.category === category);
      if (fallback) {
        byCategory[category] = fallback.id;
      }
    }
  }
  return byCategory;
}

function buildConstraintPayload(state: EditorState) {
  return {
    pa_position: state.paPosition,
    pb_position: state.pbPosition,
    seat_tube_override: {
      axis_lock: state.seatTubeAxisLock,
      position: state.categoryPositions.seat_tube ?? null,
    },
    overrides: {
      free_mode: state.isFreeMode,
      head_tube_angle_deg: state.headTubeAngleDeg,
      category_positions: state.categoryPositions,
    },
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  vehicle: "ASBGF-500",
  skeleton: null,
  catalog: [],
  componentDetails: {},
  selectedComponentIds: {},
  selectedCategory: "head_tube",
  configurationId: null,
  configurationNote: null,
  paPosition: null,
  pbPosition: null,
  categoryPositions: {},
  categoryAngles: {},
  headTubeAngleDeg: 0,
  seatTubeAxisLock: "vertical",
  isFreeMode: false,
  isLoading: false,
  error: null,

  initialize: async (requestedVehicle) => {
    const vehicle = requestedVehicle ?? get().vehicle;
    set({ isLoading: true, error: null, configurationNote: null });

    try {
      const [skeleton, catalog] = await Promise.all([
        fetchSkeletonByVehicle(vehicle),
        fetchComponents(vehicle),
      ]);

      const selectedComponentIds = chooseDefaultByCategory(catalog);
      const componentIds = Object.values(selectedComponentIds);
      const details = await Promise.all(componentIds.map((id) => fetchComponentDetail(id)));

      const componentDetails = details.reduce<Record<number, ComponentDetail>>((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});

      const headTube = getHeadTubeComponent({ selectedComponentIds, componentDetails });
      const categoryPositions = buildCategoryPositions(skeleton);

      const headTubeWorld = categoryPositions.head_tube;
      const paPbWorld =
        headTubeWorld && headTube
          ? computePaPbWorldFromHeadTube(headTubeWorld, headTube, 0)
          : null;

      set({
        vehicle,
        skeleton,
        catalog,
        selectedComponentIds,
        componentDetails,
        configurationId: null,
        paPosition: paPbWorld?.pa ?? null,
        pbPosition: paPbWorld?.pb ?? null,
        categoryPositions: syncTubeAnchors(
          categoryPositions,
          paPbWorld?.pa ?? null,
          paPbWorld?.pb ?? null,
        ),
        categoryAngles: {},
        headTubeAngleDeg: 0,
        seatTubeAxisLock: "vertical",
        isFreeMode: false,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: normalizeError(error) });
    }
  },

  setVehicle: async (vehicle) => {
    await get().initialize(vehicle);
  },

  selectCategory: (category) => {
    set({ selectedCategory: category });
  },

  selectComponent: async (category, componentId) => {
    set({ isLoading: true, error: null, configurationNote: null });
    try {
      const existing = get().componentDetails[componentId];
      const detail = existing ?? (await fetchComponentDetail(componentId));

      set((state) => {
        const nextIds = { ...state.selectedComponentIds, [category]: componentId };
        const nextDetails = { ...state.componentDetails, [componentId]: detail };
        const nextPositions = { ...state.categoryPositions };

        if (!nextPositions[category]) {
          const node = state.skeleton?.nodes[CATEGORY_NODE_MAP[category]];
          if (node) {
            nextPositions[category] = { x: node.x, y: node.y };
          }
        }

        let nextPa = state.paPosition;
        let nextPb = state.pbPosition;
        let nextAngle = state.headTubeAngleDeg;

        if (category === "head_tube") {
          const headPos = nextPositions.head_tube;
          if (headPos) {
            const world = computePaPbWorldFromHeadTube(headPos, detail, state.headTubeAngleDeg);
            if (world) {
              nextPa = world.pa;
              nextPb = world.pb;
              nextAngle = computeHeadTubeAngleFromPaPb(world.pa, world.pb, detail);
            }
          }
        }

        return {
          selectedComponentIds: nextIds,
          componentDetails: nextDetails,
          categoryPositions: state.isFreeMode
            ? nextPositions
            : syncTubeAnchors(nextPositions, nextPa, nextPb),
          paPosition: nextPa,
          pbPosition: nextPb,
          headTubeAngleDeg: nextAngle,
          isLoading: false,
          configurationId: null,
        };
      });
    } catch (error) {
      set({ isLoading: false, error: normalizeError(error) });
    }
  },

  setPaPosition: (point) =>
    set((state) => {
      const headTube = getHeadTubeComponent(state);
      const nextAngle = state.pbPosition
        ? computeHeadTubeAngleFromPaPb(point, state.pbPosition, headTube)
        : state.headTubeAngleDeg;
      return {
        paPosition: point,
        categoryPositions: state.isFreeMode
          ? state.categoryPositions
          : syncTubeAnchors(state.categoryPositions, point, state.pbPosition),
        headTubeAngleDeg: nextAngle,
      };
    }),

  setPbPosition: (point) =>
    set((state) => {
      const headTube = getHeadTubeComponent(state);
      const nextAngle = state.paPosition
        ? computeHeadTubeAngleFromPaPb(state.paPosition, point, headTube)
        : state.headTubeAngleDeg;
      return {
        pbPosition: point,
        categoryPositions: state.isFreeMode
          ? state.categoryPositions
          : syncTubeAnchors(state.categoryPositions, state.paPosition, point),
        headTubeAngleDeg: nextAngle,
      };
    }),

  setHeadTubeAngleDeg: (angle) =>
    set((state) => {
      const headTube = getHeadTubeComponent(state);
      const headTubeWorld =
        state.categoryPositions.head_tube ?? state.skeleton?.nodes[CATEGORY_NODE_MAP.head_tube];
      const world =
        headTubeWorld && headTube
          ? computePaPbWorldFromHeadTube(headTubeWorld, headTube, angle)
          : null;
      const nextPa = world?.pa ?? state.paPosition;
      const nextPb = world?.pb ?? state.pbPosition;
      return {
        headTubeAngleDeg: angle,
        paPosition: nextPa,
        pbPosition: nextPb,
        categoryPositions: state.isFreeMode
          ? state.categoryPositions
          : syncTubeAnchors(state.categoryPositions, nextPa, nextPb),
      };
    }),

  setCategoryPosition: (category, worldPos) =>
    set((state) => {
      const nextPositions = { ...state.categoryPositions };
      const skeletonNode = state.skeleton?.nodes[CATEGORY_NODE_MAP[category]];
      let nextPa = state.paPosition;
      let nextPb = state.pbPosition;

      if (state.isFreeMode) {
        if (category === "head_tube") {
          const previous =
            state.categoryPositions.head_tube ?? state.skeleton?.nodes[CATEGORY_NODE_MAP.head_tube];
          if (previous) {
            const dx = worldPos.x - previous.x;
            const dy = worldPos.y - previous.y;
            if (nextPa) {
              nextPa = {
                x: Number((nextPa.x + dx).toFixed(4)),
                y: Number((nextPa.y + dy).toFixed(4)),
              };
            }
            if (nextPb) {
              nextPb = {
                x: Number((nextPb.x + dx).toFixed(4)),
                y: Number((nextPb.y + dy).toFixed(4)),
              };
            }
          }
        }
        nextPositions[category] = worldPos;
      } else if (category === "seat_tube") {
        if (skeletonNode) {
          const fixedValue =
            state.seatTubeAxisLock === "vertical" ? skeletonNode.x : skeletonNode.y;
          nextPositions[category] = applyAxisConstraint(
            worldPos,
            state.seatTubeAxisLock,
            fixedValue,
          );
        } else {
          nextPositions[category] = worldPos;
        }
      } else if (category === "top_tube") {
        if (state.paPosition) {
          nextPositions.top_tube = { x: state.paPosition.x, y: state.paPosition.y };
        }
      } else if (category === "down_tube") {
        if (state.pbPosition) {
          nextPositions.down_tube = { x: state.pbPosition.x, y: state.pbPosition.y };
        }
      } else if (skeletonNode) {
        nextPositions[category] = { x: skeletonNode.x, y: skeletonNode.y };
      }

      return {
        categoryPositions: nextPositions,
        paPosition: nextPa,
        pbPosition: nextPb,
      };
    }),

  setCategoryAngle: (category, angleDeg) =>
    set((state) => ({
      categoryAngles: { ...state.categoryAngles, [category]: angleDeg },
    })),

  nudgeCategory: (category, dx, dy) =>
    set((state) => {
      const current =
        state.categoryPositions[category] ??
        state.skeleton?.nodes[CATEGORY_NODE_MAP[category]] ??
        null;
      if (!current) return {};
      const next = {
        x: Number((current.x + dx).toFixed(4)),
        y: Number((current.y + dy).toFixed(4)),
      };
      return {
        categoryPositions: { ...state.categoryPositions, [category]: next },
      };
    }),

  resetCategoryToDefault: (category) =>
    set((state) => {
      const skeletonPos = state.skeleton?.nodes[CATEGORY_NODE_MAP[category]];
      const nextPositions = { ...state.categoryPositions };
      if (skeletonPos) {
        nextPositions[category] = { x: skeletonPos.x, y: skeletonPos.y };
      } else {
        delete nextPositions[category];
      }
      const nextAngles = { ...state.categoryAngles };
      delete nextAngles[category];
      // Recompute PA/PB when head tube is reset
      let nextPa = state.paPosition;
      let nextPb = state.pbPosition;
      if (category === "head_tube") {
        const ht = nextPositions.head_tube;
        const headTube = getHeadTubeComponent(state);
        const world = ht && headTube
          ? computePaPbWorldFromHeadTube(ht, headTube, 0)
          : null;
        nextPa = world?.pa ?? state.paPosition;
        nextPb = world?.pb ?? state.pbPosition;
      }
      return {
        categoryPositions: nextPositions,
        categoryAngles: nextAngles,
        paPosition: nextPa,
        pbPosition: nextPb,
        headTubeAngleDeg: category === "head_tube" ? 0 : state.headTubeAngleDeg,
      };
    }),

  setSeatTubeAxisLock: (axis) =>
    set((state) => {
      const nextPositions = { ...state.categoryPositions };
      const seatNode = state.skeleton?.nodes[CATEGORY_NODE_MAP.seat_tube];

      if (seatNode && nextPositions.seat_tube && !state.isFreeMode) {
        const fixedValue = axis === "vertical" ? seatNode.x : seatNode.y;
        nextPositions.seat_tube = applyAxisConstraint(nextPositions.seat_tube, axis, fixedValue);
      }

      return {
        seatTubeAxisLock: axis,
        categoryPositions: nextPositions,
      };
    }),

  toggleFreeMode: () =>
    set((state) => {
      const nextFree = !state.isFreeMode;
      if (nextFree) {
        return { isFreeMode: true };
      }

      const snapped = buildCategoryPositions(state.skeleton);
      const seatNode = state.skeleton?.nodes[CATEGORY_NODE_MAP.seat_tube];
      const currentSeat = state.categoryPositions.seat_tube;
      if (seatNode && currentSeat) {
        const fixedValue =
          state.seatTubeAxisLock === "vertical" ? seatNode.x : seatNode.y;
        snapped.seat_tube = applyAxisConstraint(currentSeat, state.seatTubeAxisLock, fixedValue);
      }

      const headTube = getHeadTubeComponent(state);
      const headWorld = snapped.head_tube;
      const world =
        headWorld && headTube
          ? computePaPbWorldFromHeadTube(headWorld, headTube, state.headTubeAngleDeg)
          : null;
      const nextPa = world?.pa ?? state.paPosition;
      const nextPb = world?.pb ?? state.pbPosition;

      return {
        isFreeMode: false,
        categoryPositions: syncTubeAnchors(snapped, nextPa, nextPb),
        paPosition: nextPa,
        pbPosition: nextPb,
      };
    }),

  saveNewConfiguration: async (name) => {
    const state = get();
    if (!state.skeleton) {
      set({ error: "Cannot save configuration before skeleton is loaded." });
      return;
    }

    const components = refsFromSelected(state.selectedComponentIds);
    if (components.length === 0) {
      set({ error: "Cannot save an empty configuration." });
      return;
    }

    set({ isLoading: true, error: null, configurationNote: null });
    try {
      const payload = {
        skeleton_id: state.skeleton.id,
        name: name ?? `${state.vehicle} config`,
        components,
        ...buildConstraintPayload(state),
      };

      const created = await createConfiguration(payload);
      set({
        configurationId: created.id,
        configurationNote: `Saved configuration #${created.id}`,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: normalizeError(error) });
    }
  },

  updateConfigurationConstraints: async () => {
    const state = get();
    if (!state.configurationId) {
      set({ error: "No active configuration. Save a new configuration first." });
      return;
    }

    set({ isLoading: true, error: null, configurationNote: null });
    try {
      await patchConfigurationConstraints(state.configurationId, buildConstraintPayload(state));
      set({
        isLoading: false,
        configurationNote: `Updated constraints for configuration #${state.configurationId}`,
      });
    } catch (error) {
      set({ isLoading: false, error: normalizeError(error) });
    }
  },

  confirmPaPb: async () => {
    const state = get();
    const headTubeId = state.selectedComponentIds.head_tube;
    if (!headTubeId) {
      set({ error: "No head tube component selected." });
      return;
    }
    if (!state.paPosition || !state.pbPosition) {
      set({ error: "PA and PB positions are not set." });
      return;
    }

    set({ isLoading: true, error: null, configurationNote: null });
    try {
      const updated = await confirmComponentPaPb(headTubeId, {
        pa: state.paPosition,
        pb: state.pbPosition,
        skeleton_id: state.skeleton?.id,
        head_tube_angle_deg: state.headTubeAngleDeg,
      });

      // Refresh the component detail in the store with the server response
      set((s) => ({
        componentDetails: { ...s.componentDetails, [updated.id]: updated },
        isLoading: false,
        configurationNote: `PA/PB confirmed and written to DXF for ${updated.full_code}`,
      }));
    } catch (error) {
      set({ isLoading: false, error: normalizeError(error) });
    }
  },

  loadConfiguration: async (configurationId) => {
    if (!Number.isInteger(configurationId) || configurationId <= 0) {
      set({ error: "Configuration id must be a positive integer." });
      return;
    }

    set({ isLoading: true, error: null, configurationNote: null });

    try {
      const configuration = await fetchConfiguration(configurationId);
      if (!configuration.skeleton_id) {
        throw new Error("Configuration has no skeleton_id.");
      }

      const skeleton = await fetchSkeletonById(configuration.skeleton_id);
      const vehicle = skeleton.vehicle;
      const catalog = await fetchComponents(vehicle);

      const selectedComponentIds = buildSelectedFromConfiguration(catalog, configuration.components);
      const uniqueIds = Array.from(new Set(Object.values(selectedComponentIds)));
      const details = await Promise.all(uniqueIds.map((id) => fetchComponentDetail(id)));
      const componentDetails = details.reduce<Record<number, ComponentDetail>>((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});

      const headTube = getHeadTubeComponent({ selectedComponentIds, componentDetails });
      const headTubeAngleDeg = parseOverrideHeadAngle(configuration.overrides);
      const isFreeMode = parseOverrideFreeMode(configuration.overrides);
      const seatTubeAxisLock = parseSeatTubeAxisLock(configuration.seat_tube_override);

      let categoryPositions = buildCategoryPositions(skeleton);
      if (isFreeMode) {
        categoryPositions = {
          ...categoryPositions,
          ...parseOverrideCategoryPositions(configuration.overrides),
        };
      }

      const seatOverride = parsePoint(
        configuration.seat_tube_override?.position,
      );
      if (seatOverride) {
        if (isFreeMode) {
          categoryPositions.seat_tube = seatOverride;
        } else {
          const seatNode = skeleton.nodes[CATEGORY_NODE_MAP.seat_tube];
          if (seatNode) {
            const fixedValue = seatTubeAxisLock === "vertical" ? seatNode.x : seatNode.y;
            categoryPositions.seat_tube = applyAxisConstraint(
              seatOverride,
              seatTubeAxisLock,
              fixedValue,
            );
          }
        }
      }

      let paPosition = parsePoint(configuration.pa_position);
      let pbPosition = parsePoint(configuration.pb_position);

      const headTubeWorld = categoryPositions.head_tube;
      if (headTubeWorld && headTube && (!paPosition || !pbPosition)) {
        const computed = computePaPbWorldFromHeadTube(headTubeWorld, headTube, headTubeAngleDeg);
        if (computed) {
          paPosition = paPosition ?? computed.pa;
          pbPosition = pbPosition ?? computed.pb;
        }
      }

      if (!isFreeMode) {
        categoryPositions = syncTubeAnchors(categoryPositions, paPosition, pbPosition);
      }

      set({
        vehicle,
        skeleton,
        catalog,
        selectedComponentIds,
        componentDetails,
        selectedCategory: "head_tube",
        configurationId: configuration.id,
        configurationNote: `Loaded configuration #${configuration.id}`,
        paPosition,
        pbPosition,
        categoryPositions,
        headTubeAngleDeg,
        seatTubeAxisLock,
        isFreeMode,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: normalizeError(error) });
    }
  },
}));
