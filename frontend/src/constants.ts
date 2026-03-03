import type { AttachNodeName, Category, Vehicle } from "./types";

export const VEHICLES: Vehicle[] = ["ASBGF-500", "RAGTD-44", "RMBLC460"];

export const CATEGORY_ORDER: Category[] = [
  "head_tube",
  "top_tube",
  "down_tube",
  "seat_tube",
  "motor_mount",
  "seat_stay",
  "chain_stay",
  "fork_end",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  head_tube: "Head Tube",
  top_tube: "Top Tube",
  down_tube: "Down Tube",
  seat_tube: "Seat Tube",
  motor_mount: "Motor Mount",
  seat_stay: "Seat Stay",
  chain_stay: "Chain Stay",
  fork_end: "Fork End",
};

export const CATEGORY_NODE_MAP: Record<Category, AttachNodeName> = {
  head_tube: "HT_Attach",
  top_tube: "TT_Attach",
  down_tube: "DT_Attach",
  seat_tube: "ST_Attach",
  motor_mount: "Motor_Attach",
  seat_stay: "SS_Attach",
  chain_stay: "CS_Attach",
  fork_end: "END_Attach",
};

export const REQUIRED_NODES: AttachNodeName[] = [
  "HT_Attach",
  "ST_Attach",
  "Motor_Attach",
  "SS_Attach",
  "CS_Attach",
  "END_Attach",
];
