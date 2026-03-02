export type Vehicle = "ASBGF-500" | "RAGTD-44";

export type Category =
  | "head_tube"
  | "top_tube"
  | "down_tube"
  | "seat_tube"
  | "motor_mount"
  | "seat_stay"
  | "chain_stay"
  | "fork_end";

export type AxisLock = "vertical" | "horizontal";

export type AttachNodeName =
  | "HT_Attach"
  | "TT_Attach"
  | "DT_Attach"
  | "ST_Attach"
  | "ST_Attach2"
  | "Motor_Attach"
  | "SS_Attach"
  | "CS_Attach"
  | "END_Attach";

export interface Point {
  x: number;
  y: number;
}

export interface ComponentListItem {
  id: number;
  name: string;
  full_code: string;
  category: Category;
  vehicle: Vehicle;
  dwg_filename: string;
  attach_block_name: string | null;
}

export interface ComponentDetail {
  id: number;
  name: string;
  full_code: string;
  category: Category;
  vehicle: Vehicle;
  preview_svg: string | null;
  attach_primary: Point | null;
  attach_block_name: string | null;
  attach_secondary: Point | null;
  attach_secondary_block_name: string | null;
  pa_default: Point | null;
  pb_default: Point | null;
  physical_length_mm: number | null;
  specifications: Record<string, unknown> | null;
}

export interface SkeletonListItem {
  id: number;
  vehicle: Vehicle;
  name: string;
}

export interface SkeletonDetail {
  id: number;
  vehicle: Vehicle;
  name: string;
  dwg_path: string;
  preview_svg: string | null;
  nodes: Partial<Record<AttachNodeName, Point>>;
  geometry: Record<string, unknown> | null;
  created_at: string;
}

export interface ConfigurationComponentRef {
  category: Category;
  component_id: number;
}

export interface ConfigurationDetail {
  id: number;
  skeleton_id: number | null;
  name: string | null;
  components: ConfigurationComponentRef[];
  pa_position: Point | null;
  pb_position: Point | null;
  seat_tube_override: Record<string, unknown> | null;
  overrides: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ConfigurationCreatePayload {
  skeleton_id: number;
  name?: string;
  components: ConfigurationComponentRef[];
  pa_position?: Point | null;
  pb_position?: Point | null;
  seat_tube_override?: Record<string, unknown> | null;
  overrides?: Record<string, unknown> | null;
}

export interface ConfigurationConstraintsPatchPayload {
  pa_position?: Point | null;
  pb_position?: Point | null;
  seat_tube_override?: Record<string, unknown> | null;
  overrides?: Record<string, unknown> | null;
}
