/**
 * geminiKeyStore.ts — stores the user-provided Gemini API key in localStorage.
 *
 * The key is sent as `X-Gemini-Key` header on every AI request.
 * The backend will use it in preference to the server-side .env key.
 */
import { create } from "zustand";

const STORAGE_KEY = "ibds_gemini_key";

interface GeminiKeyState {
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

function readPersistedKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export const useGeminiKeyStore = create<GeminiKeyState>()((set) => ({
  apiKey: readPersistedKey(),

  setApiKey: (key) => {
    try {
      if (key.trim()) {
        localStorage.setItem(STORAGE_KEY, key.trim());
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    set({ apiKey: key.trim() });
  },

  clearApiKey: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    set({ apiKey: "" });
  },
}));

/** Read the current key without subscribing (for use in fetch helpers). */
export function getGeminiKey(): string {
  return useGeminiKeyStore.getState().apiKey;
}
