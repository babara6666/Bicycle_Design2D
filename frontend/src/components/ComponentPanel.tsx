import { useEffect, useState } from "react";

import { CATEGORY_LABELS, CATEGORY_ORDER } from "../constants";
import { fetchAllComponents } from "../services/api";
import type { Category, ComponentListItem, Point } from "../types";

interface ComponentPanelProps {
  catalog: ComponentListItem[];
  selectedCategory: Category;
  selectedComponentIds: Partial<Record<Category, number>>;
  categoryAngles: Partial<Record<Category, number>>;
  categoryPositions: Partial<Record<Category, Point>>;
  hiddenCategories: Set<Category>;
  onSelectCategory: (category: Category) => void;
  onSelectComponent: (category: Category, componentId: number) => void;
  onSetCategoryAngle: (category: Category, angleDeg: number) => void;
  onNudgeCategory: (category: Category, dx: number, dy: number) => void;
  onResetCategory: (category: Category) => void;
  onToggleHideCategory: (category: Category) => void;
}

export function ComponentPanel({
  catalog,
  selectedCategory,
  selectedComponentIds,
  categoryAngles,
  categoryPositions,
  hiddenCategories,
  onSelectCategory,
  onSelectComponent,
  onSetCategoryAngle,
  onNudgeCategory,
  onResetCategory,
  onToggleHideCategory,
}: ComponentPanelProps) {
  const [expandedCategory, setExpandedCategory] = useState<Category | null>(null);
  const [crossVehicleCatalog, setCrossVehicleCatalog] = useState<ComponentListItem[]>([]);
  const [crossLoading, setCrossLoading] = useState(false);

  // Load all vehicles' components once for cross-vehicle replacement
  useEffect(() => {
    setCrossLoading(true);
    fetchAllComponents()
      .then((all) => setCrossVehicleCatalog(all))
      .catch(() => setCrossVehicleCatalog([]))
      .finally(() => setCrossLoading(false));
  }, []);

  const NUDGE = 2; // mm per nudge click

  return (
    <section className="panel-card">
      <div className="panel-heading">
        <h2>Components</h2>
        <p>Select, rotate, and reposition each part. Click a row to expand controls.</p>
      </div>

      <div className="component-list">
        {CATEGORY_ORDER.map((category) => {
          const options = catalog.filter((item) => item.category === category);
          const defaultId = options[0]?.id;
          const selectedId = selectedComponentIds[category] ?? defaultId;
          const isSelectedCategory = selectedCategory === category;
          const isExpanded = expandedCategory === category;
          const isHidden = hiddenCategories.has(category);
          const angleDeg = categoryAngles[category] ?? 0;
          const pos = categoryPositions[category];

          // Cross-vehicle options: all components of same category, EXCLUDING current vehicle's parts
          const currentVehicleIds = new Set(options.map((o) => o.id));
          const crossOptions = crossVehicleCatalog.filter(
            (item) => item.category === category && !currentVehicleIds.has(item.id),
          );

          // Detect if currently selected part is from another vehicle
          const isCrossVehicle = selectedId !== undefined && !currentVehicleIds.has(selectedId);
          const crossSelected = isCrossVehicle
            ? crossVehicleCatalog.find((item) => item.id === selectedId)
            : null;

          return (
            <article
              key={category}
              className={`component-item ${isSelectedCategory ? "selected" : ""}`}
            >
              <header
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelectCategory(category);
                  setExpandedCategory(isExpanded ? null : category);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectCategory(category);
                    setExpandedCategory(isExpanded ? null : category);
                  }
                }}
                style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <h3 style={{ opacity: isHidden ? 0.4 : 1 }}>{CATEGORY_LABELS[category]}</h3>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {/* Hide/show toggle */}
                  <button
                    type="button"
                    title={isHidden ? "Show part" : "Hide part"}
                    onClick={(e) => { e.stopPropagation(); onToggleHideCategory(category); }}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: "0.9rem", padding: "0 2px", lineHeight: 1,
                      opacity: isHidden ? 1 : 0.5,
                    }}
                  >
                    {isHidden ? "🙈" : "👁"}
                  </button>
                  <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                    {isCrossVehicle && <span style={{ color: "var(--accent, #6ee7b7)", marginRight: 4 }}>🔄</span>}
                    {angleDeg !== 0 ? `${angleDeg.toFixed(1)}°` : ""}
                    {isExpanded ? " ▲" : " ▼"}
                  </span>
                </span>
              </header>

              {/* Same-vehicle part selector */}
              <label onClick={(e) => e.stopPropagation()}>
                <span>Part</span>
                <select
                  value={isCrossVehicle ? "__cross__" : (selectedId ?? "")}
                  onChange={(event) => {
                    const val = event.target.value;
                    if (val !== "__cross__") onSelectComponent(category, Number(val));
                  }}
                >
                  {isCrossVehicle && crossSelected && (
                    <option value="__cross__" disabled>
                      🔄 [{crossSelected.vehicle}] {crossSelected.full_code}
                    </option>
                  )}
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.full_code}
                    </option>
                  ))}
                </select>
              </label>

              {/* Restore default button when cross-vehicle part is active */}
              {isCrossVehicle && defaultId && (
                <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 2 }}>
                  <button
                    type="button"
                    style={{ fontSize: "0.72rem", opacity: 0.8, cursor: "pointer" }}
                    onClick={() => onSelectComponent(category, defaultId)}
                  >
                    ↩ 還原預設零件
                  </button>
                </div>
              )}

              {/* Cross-vehicle replacement (shown when expanded) */}
              {isExpanded && crossOptions.length > 0 && (
                <label
                  onClick={(e) => e.stopPropagation()}
                  title="置換為其他車款的同位置零件（加入點保持不變）"
                >
                  <span style={{ color: "var(--accent, #6ee7b7)" }}>
                    🔄 置換 (其他車款)
                  </span>
                  <select
                    defaultValue=""
                    disabled={crossLoading}
                    onChange={(event) => {
                      const id = Number(event.target.value);
                      if (id) onSelectComponent(category, id);
                      // Reset to placeholder after selection so UI is clear
                      event.target.value = "";
                    }}
                  >
                    <option value="" disabled>
                      {crossLoading ? "載入中…" : "選擇其他車款零件…"}
                    </option>
                    {crossOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        [{option.vehicle}] {option.full_code}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {isExpanded && (
                <div className="part-controls" onClick={(e) => e.stopPropagation()}>
                  {/* Angle */}
                  <div className="field-group">
                    <label htmlFor={`angle-${category}`}>
                      Angle ({angleDeg.toFixed(1)}°)
                    </label>
                    <input
                      id={`angle-${category}`}
                      type="range"
                      min={-180}
                      max={180}
                      step={0.5}
                      value={angleDeg}
                      onChange={(e) => onSetCategoryAngle(category, Number(e.target.value))}
                    />
                  </div>

                  {/* Precise angle input */}
                  <div className="field-group">
                    <label htmlFor={`angle-num-${category}`}>精確角度 (°)</label>
                    <input
                      id={`angle-num-${category}`}
                      type="number"
                      step={0.1}
                      value={angleDeg.toFixed(1)}
                      style={{ width: "70px" }}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= -360 && v <= 360) {
                          onSetCategoryAngle(category, v);
                        }
                      }}
                    />
                  </div>

                  {/* Position nudge */}
                  <div className="field-group">
                    <label>Position nudge ({NUDGE} mm)</label>
                    <div className="nudge-grid">
                      <span />
                      <button type="button" onClick={() => onNudgeCategory(category, 0, NUDGE)}>▲</button>
                      <span />
                      <button type="button" onClick={() => onNudgeCategory(category, -NUDGE, 0)}>◄</button>
                      <button type="button" onClick={() => onNudgeCategory(category, 0, 0)} title="centre">·</button>
                      <button type="button" onClick={() => onNudgeCategory(category, NUDGE, 0)}>►</button>
                      <span />
                      <button type="button" onClick={() => onNudgeCategory(category, 0, -NUDGE)}>▼</button>
                      <span />
                    </div>
                    {pos && (
                      <small style={{ opacity: 0.55 }}>
                        x {pos.x.toFixed(1)}  y {pos.y.toFixed(1)}
                      </small>
                    )}
                  </div>

                  {/* Precise X/Y input */}
                  <div className="field-group" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <label htmlFor={`pos-x-${category}`}>X (mm)</label>
                      <input
                        id={`pos-x-${category}`}
                        type="number"
                        step={0.1}
                        value={pos?.x.toFixed(1) ?? "0.0"}
                        style={{ width: "70px" }}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && pos) {
                            const dx = v - pos.x;
                            onNudgeCategory(category, dx, 0);
                          }
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label htmlFor={`pos-y-${category}`}>Y (mm)</label>
                      <input
                        id={`pos-y-${category}`}
                        type="number"
                        step={0.1}
                        value={pos?.y.toFixed(1) ?? "0.0"}
                        style={{ width: "70px" }}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && pos) {
                            const dy = v - pos.y;
                            onNudgeCategory(category, 0, dy);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Reset */}
                  <button
                    type="button"
                    className="btn-reset-part"
                    onClick={() => {
                      onSetCategoryAngle(category, 0);
                      onResetCategory(category);
                    }}
                  >
                    Reset to default
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
