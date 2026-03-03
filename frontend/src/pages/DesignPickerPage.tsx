import { useNavigate, useParams } from "react-router-dom";
import { VEHICLES } from "../constants";
import type { Vehicle } from "../types";
import "./DesignPickerPage.css";

// Map category code → which vehicles belong to it
// Extend this when you add real categorisation in the DB
const CATEGORY_VEHICLES: Record<string, Vehicle[]> = {
  Male: ["ASBGF-500", "RAGTD-44", "RMBLC460"],
  Female: ["ASBGF-500"],
  Wave: ["RAGTD-44"],
  Suspension: ["RMBLC460"],
};

// Fallback: if a category is unknown, show all vehicles
function vehiclesForCategory(code: string): Vehicle[] {
  return CATEGORY_VEHICLES[code] ?? (VEHICLES as Vehicle[]);
}

export default function DesignPickerPage() {
  const { typeCode = "Male" } = useParams<{ typeCode: string }>();
  const navigate = useNavigate();
  const vehicles = vehiclesForCategory(typeCode);

  const handleSelect = (vehicle: Vehicle) => {
    navigate(`/editor?vehicle=${vehicle}`);
  };

  return (
    <div className="picker-shell">
      <div className="picker-bg" />

      <div className="picker-content">
        {/* Header */}
        <header className="picker-header">
          <button
            className="picker-back"
            onClick={() => navigate("/")}
            type="button"
          >
            ← 返回
          </button>
          <div className="picker-brand">
            <span className="picker-kicker">IBDS</span>
            <span className="picker-brand-name">Bicycle 2D Design Studio</span>
          </div>
        </header>

        {/* Title */}
        <section className="picker-hero">
          <h2 className="picker-title">
            <span className="picker-category-tag">{typeCode}</span>
            設計模板
          </h2>
          <p className="picker-sub">選擇一個模板開始您的客製化設計</p>
        </section>

        {/* Template Grid */}
        <div className="picker-grid">
          {vehicles.map((vehicle) => (
            <button
              key={vehicle}
              className="picker-card"
              onClick={() => handleSelect(vehicle)}
              type="button"
            >
              {/* SVG Preview placeholder */}
              <div className="picker-card-thumb">
                <div className="picker-card-thumb-inner">
                  <svg viewBox="0 0 100 60" className="picker-thumb-svg">
                    {/* Stylised frame icon */}
                    <rect x="10" y="25" width="80" height="2" rx="1" fill="#1e6d90" opacity="0.3" />
                    <circle cx="22" cy="45" r="10" stroke="#1e6d90" strokeWidth="2" fill="none" opacity="0.4" />
                    <circle cx="78" cy="45" r="10" stroke="#1e6d90" strokeWidth="2" fill="none" opacity="0.4" />
                    <line x1="22" y1="26" x2="40" y2="10" stroke="#1e6d90" strokeWidth="2" opacity="0.5" />
                    <line x1="40" y1="10" x2="78" y2="26" stroke="#1e6d90" strokeWidth="2" opacity="0.5" />
                    <line x1="40" y1="10" x2="40" y2="45" stroke="#1e6d90" strokeWidth="2" opacity="0.5" />
                    <line x1="22" y1="35" x2="40" y2="26" stroke="#1e6d90" strokeWidth="1.5" opacity="0.4" />
                    <line x1="78" y1="35" x2="60" y2="45" stroke="#1e6d90" strokeWidth="1.5" opacity="0.4" />
                  </svg>
                </div>
                <span className="picker-card-badge">{typeCode}</span>
              </div>

              <div className="picker-card-info">
                <h3 className="picker-card-name">{vehicle}</h3>
                <p className="picker-card-desc">點擊在 2D 編輯器中開啟此模板</p>
                <div className="picker-card-footer">
                  <span className="picker-card-tag">模板</span>
                  <span className="picker-card-cta">開始設計 →</span>
                </div>
              </div>
            </button>
          ))}

          {/* Blank Editor Card */}
          <button
            className="picker-card picker-card-blank"
            onClick={() => navigate("/editor")}
            type="button"
          >
            <div className="picker-card-thumb picker-blank-thumb">
              <span className="picker-blank-plus">＋</span>
            </div>
            <div className="picker-card-info">
              <h3 className="picker-card-name">從頭開始</h3>
              <p className="picker-card-desc">開啟空白編輯器，選擇您需要的車款</p>
              <div className="picker-card-footer">
                <span className="picker-card-tag">空白</span>
                <span className="picker-card-cta">開啟 →</span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
