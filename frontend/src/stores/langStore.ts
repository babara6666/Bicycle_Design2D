import { create } from "zustand";

type Lang = "zh" | "en";

interface LangState {
  lang: Lang;
  toggle: () => void;
}

export const useLangStore = create<LangState>()((set) => ({
  lang: (localStorage.getItem("ibds_lang") as Lang) ?? "zh",
  toggle: () =>
    set((s) => {
      const next: Lang = s.lang === "zh" ? "en" : "zh";
      localStorage.setItem("ibds_lang", next);
      return { lang: next };
    }),
}));
