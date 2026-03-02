/**
 * authStore.ts — Zustand store for JWT authentication state.
 *
 * Token is persisted in localStorage so the user stays logged in across
 * page refreshes.  The axios client in api.ts reads `getToken()` via an
 * interceptor on every request.
 */
import { create } from "zustand";

const TOKEN_KEY = "ibds_token";
const ROLE_KEY = "ibds_role";
const USER_KEY = "ibds_user";

export type Role = "viewer" | "editor" | "admin";

interface AuthState {
  token: string | null;
  role: Role | null;
  username: string | null;
  isAuthenticated: boolean;

  /** Called after a successful /api/auth/login response. */
  setAuth: (token: string, role: Role, username: string) => void;

  /** Clear all auth state and localStorage. */
  logout: () => void;
}

/** Read persisted values from localStorage (SSR-safe). */
function readPersisted() {
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY),
      role: localStorage.getItem(ROLE_KEY) as Role | null,
      username: localStorage.getItem(USER_KEY),
    };
  } catch {
    return { token: null, role: null, username: null };
  }
}

const persisted = readPersisted();

export const useAuthStore = create<AuthState>()((set) => ({
  token: persisted.token,
  role: persisted.role,
  username: persisted.username,
  isAuthenticated: !!persisted.token,

  setAuth: (token, role, username) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(ROLE_KEY, role);
      localStorage.setItem(USER_KEY, username);
    } catch {
      // ignore storage errors
    }
    set({ token, role, username, isAuthenticated: true });
  },

  logout: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ROLE_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
    set({ token: null, role: null, username: null, isAuthenticated: false });
  },
}));

/** Convenience helper — returns the current token without subscribing. */
export function getToken(): string | null {
  return useAuthStore.getState().token;
}
