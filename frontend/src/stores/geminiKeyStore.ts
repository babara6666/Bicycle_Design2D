import { create } from "zustand";

const STORAGE_KEY = "ibds_gemini_key";

interface GeminiKeyState {
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

function clearPersistedKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function loadPersistedKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export const useGeminiKeyStore = create<GeminiKeyState>()((set) => ({
  apiKey: loadPersistedKey(),

  setApiKey: (key) => {
    // Strip non-printable / non-ASCII characters before storing (e.g. \xa0
    // non-breaking space introduced by copy-pasting from a browser/PDF).
    const trimmed = key.replace(/[^\x21-\x7E]/g, "").trim();
    try {
      if (trimmed) {
        localStorage.setItem(STORAGE_KEY, trimmed);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    set({ apiKey: trimmed });
  },

  clearApiKey: () => {
    clearPersistedKey();
    set({ apiKey: "" });
  },
}));

export function getGeminiKey(): string {
  return useGeminiKeyStore.getState().apiKey;
}
