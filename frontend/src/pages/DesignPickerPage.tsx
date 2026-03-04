import { useNavigate, useParams } from "react-router-dom";
import type { Vehicle } from "../types";
import "./DesignPickerPage.css";

// Map category code → which vehicles belong to it
const CATEGORY_VEHICLES: Record<string, Vehicle[]> = {
  Male: ["ASBGF-500", "RAGTD-44"],
  Female: ["RESLA-450", "RMBLC460"],
  Wave: ["WB4GI8A_48"],
};

// Vehicle → photo in public/
const VEHICLE_PHOTOS: Record<Vehicle, string> = {
  "ASBGF-500": "/ASBGF-500.png",
  "RAGTD-44": "/RAGTD-44.png",
  "RESLA-450": "/RESLA-450.png",
  "RMBLC460": "/RMBLC460.png",
  "WB4GI8A_48": "/WB4GI8A_48.png",
};

// Fallback: if a category is unknown, show all vehicles
function vehiclesForCategory(code: string): Vehicle[] {
  const all: Vehicle[] = ["ASBGF-500", "RAGTD-44", "RESLA-450", "RMBLC460", "WB4GI8A_48"];
  return CATEGORY_VEHICLES[code] ?? all;
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
            <img
              src="/company-logo.png"
              alt="IBDS"
              className="picker-logo"
              onClick={() => navigate("/")}
              style={{ cursor: "pointer", height: 40, objectFit: "contain" }}
            />
            <div>
              <span className="picker-kicker">IBDS</span>
              <span className="picker-brand-name">Bicycle 2D Design Studio</span>
            </div>
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
              {/* Photo Preview */}
              <div className="picker-card-thumb">
                <div className="picker-card-thumb-inner">
                  <img
                    src={VEHICLE_PHOTOS[vehicle]}
                    alt={vehicle}
                    className="picker-thumb-photo"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
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
