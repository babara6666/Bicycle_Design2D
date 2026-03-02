import axios from "axios";

import { getToken } from "../stores/authStore";
import type {
  ComponentDetail,
  ComponentListItem,
  ConfigurationConstraintsPatchPayload,
  ConfigurationCreatePayload,
  ConfigurationDetail,
  SkeletonDetail,
  SkeletonListItem,
  Vehicle,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// Attach JWT Bearer token to every request when available
client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function fetchComponents(vehicle: Vehicle): Promise<ComponentListItem[]> {
  const response = await client.get<ComponentListItem[]>("/api/components", {
    params: { vehicle },
  });
  return response.data;
}

export async function fetchComponentDetail(id: number): Promise<ComponentDetail> {
  const response = await client.get<ComponentDetail>(`/api/components/${id}`);
  return response.data;
}

export async function fetchSkeletonByVehicle(vehicle: Vehicle): Promise<SkeletonDetail> {
  const listResponse = await client.get<SkeletonListItem[]>("/api/skeletons");
  const skeleton = listResponse.data.find((item) => item.vehicle === vehicle);

  if (!skeleton) {
    throw new Error(`No skeleton found for vehicle: ${vehicle}`);
  }

  const detailResponse = await client.get<SkeletonDetail>(`/api/skeletons/${skeleton.id}`);
  return detailResponse.data;
}

export async function fetchSkeletonById(id: number): Promise<SkeletonDetail> {
  const response = await client.get<SkeletonDetail>(`/api/skeletons/${id}`);
  return response.data;
}

export async function createConfiguration(
  payload: ConfigurationCreatePayload,
): Promise<ConfigurationDetail> {
  const response = await client.post<ConfigurationDetail>("/api/configurations", payload);
  return response.data;
}

export async function fetchConfiguration(id: number): Promise<ConfigurationDetail> {
  const response = await client.get<ConfigurationDetail>(`/api/configurations/${id}`);
  return response.data;
}

export async function patchConfigurationConstraints(
  id: number,
  payload: ConfigurationConstraintsPatchPayload,
): Promise<ConfigurationDetail> {
  const response = await client.patch<ConfigurationDetail>(
    `/api/configurations/${id}/constraints`,
    payload,
  );
  return response.data;
}

export interface ConfirmPaPbPayload {
  pa: { x: number; y: number };
  pb: { x: number; y: number };
  skeleton_id?: number;
  head_tube_angle_deg?: number;
}

export async function confirmComponentPaPb(
  componentId: number,
  payload: ConfirmPaPbPayload,
): Promise<ComponentDetail> {
  const response = await client.post<ComponentDetail>(
    `/api/components/${componentId}/confirm-pa-pb`,
    payload,
  );
  return response.data;
}

// ── Auth API ──────────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: "viewer" | "editor" | "admin";
}

export async function apiLogin(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const response = await client.post<LoginResponse>("/api/auth/login", {
    username,
    password,
  });
  return response.data;
}
