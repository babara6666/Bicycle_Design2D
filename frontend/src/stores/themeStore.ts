import { create } from "zustand";

type Theme = "light" | "dark";

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

const stored = (localStorage.getItem("ibds_theme") as Theme) ?? "light";
applyTheme(stored);

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: stored,
  toggle: () =>
    set((s) => {
      const next: Theme = s.theme === "light" ? "dark" : "light";
      localStorage.setItem("ibds_theme", next);
      applyTheme(next);
      return { theme: next };
    }),
}));
