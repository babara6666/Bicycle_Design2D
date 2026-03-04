import { useNavigate, useParams } from "react-router-dom";
import type { Vehicle } from "../types";
import { useLangStore } from "../stores/langStore";
import { useThemeStore } from "../stores/themeStore";
import "./DesignPickerPage.css";

const CATEGORY_VEHICLES: Record<string, Vehicle[]> = {
  Male:     ["ASBGF-500", "RAGTD-44"],
  Female:   ["RESLA-450", "RMBLC460"],
  Wave:     ["WB4GI8A_48"],
  Mountain: [],          // placeholder — no DWG data yet
};

const VEHICLE_PHOTOS: Record<Vehicle, string> = {
  "ASBGF-500": "/ASBGF-500.png",
  "RAGTD-44":  "/RAGTD-44.png",
  "RESLA-450": "/RESLA-450.png",
  "RMBLC460":  "/RMBLC460.png",
  "WB4GI8A_48":"/WB4GI8A_48.png",
};

const CATEGORY_LABEL: Record<string, { zh: string; en: string }> = {
  Male:     { zh: "男車",   en: "Male Frame"    },
  Female:   { zh: "女車",   en: "Female Frame"  },
  Wave:     { zh: "Wave",   en: "Wave Frame"    },
  Mountain: { zh: "登山車", en: "Mountain Bike" },
};

const LABELS = {
  zh: { back: "← 返回", title: "設計模板", sub: "選擇一個模板開始您的客製化設計", open: "開啟 →", template: "模板", blank: "從頭開始", blankDesc: "開啟空白編輯器，選擇您需要的車款", blankBtn: "空白" },
  en: { back: "← Back",  title: "Templates",   sub: "Pick a template to start your custom design",    open: "Open →", template: "Template", blank: "Start Blank", blankDesc: "Open an empty editor and pick a vehicle", blankBtn: "Blank" },
};

function vehiclesForCategory(code: string): Vehicle[] {
  const all: Vehicle[] = ["ASBGF-500", "RAGTD-44", "RESLA-450", "RMBLC460", "WB4GI8A_48"];
  return CATEGORY_VEHICLES[code] ?? all;
}

export default function DesignPickerPage() {
  const { typeCode = "Male" } = useParams<{ typeCode: string }>();
  const navigate = useNavigate();
  const { lang, toggle: toggleLang } = useLangStore();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const vehicles = vehiclesForCategory(typeCode);
  const L = LABELS[lang];
  const catLabel = CATEGORY_LABEL[typeCode] ?? { zh: typeCode, en: typeCode };

  return (
    <div className="picker-shell">
      <div className="picker-bg" />
      <div className="picker-content">

        {/* Header */}
        <header className="picker-header">
          <div className="picker-header-left">
            <button className="picker-back" onClick={() => navigate("/")} type="button">
              {L.back}
            </button>
            <button className="picker-logo-btn" onClick={() => navigate("/")} type="button" title="Home">
              <img src="/company-logo.png" alt="IBDS" className="picker-logo" />
            </button>
            <span className="picker-brand-name">Bicycle 2D Design Studio</span>
          </div>
          <div className="picker-header-right">
            <button className="picker-pill-btn" onClick={toggleLang} type="button">{lang === "zh" ? "EN" : "中"}</button>
            <button className="picker-pill-btn" onClick={toggleTheme} type="button">{theme === "light" ? "🌙" : "☀️"}</button>
          </div>
        </header>

        {/* Title */}
        <section className="picker-hero">
          <h2 className="picker-title">
            <span className="picker-category-tag">{lang === "zh" ? catLabel.zh : catLabel.en}</span>
            {L.title}
          </h2>
          <p className="picker-sub">{L.sub}</p>
        </section>

        {/* Template Grid */}
        <div className="picker-grid">
          {vehicles.map((vehicle) => (
            <button
              key={vehicle}
              className="picker-card"
              onClick={() => navigate(`/editor?vehicle=${vehicle}`)}
              type="button"
            >
              <div className="picker-card-thumb">
                <img
                  src={VEHICLE_PHOTOS[vehicle]}
                  alt={vehicle}
                  className="picker-thumb-photo"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="picker-card-badge">{lang === "zh" ? catLabel.zh : catLabel.en}</span>
              </div>
              <div className="picker-card-info">
                <h3 className="picker-card-name">{vehicle}</h3>
                <div className="picker-card-footer">
                  <span className="picker-card-tag">{L.template}</span>
                  <span className="picker-card-cta">{L.open}</span>
                </div>
              </div>
            </button>
          ))}

          {/* Blank */}
          <button className="picker-card picker-card-blank" onClick={() => navigate("/editor")} type="button">
            <div className="picker-card-thumb picker-blank-thumb">
              <span className="picker-blank-plus">＋</span>
            </div>
            <div className="picker-card-info">
              <h3 className="picker-card-name">{L.blank}</h3>
              <div className="picker-card-footer">
                <span className="picker-card-tag">{L.blankBtn}</span>
                <span className="picker-card-cta">{L.open}</span>
              </div>
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}
