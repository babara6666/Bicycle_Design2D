import { useState } from "react";

import { CATEGORY_LABELS, CATEGORY_ORDER } from "../constants";
import type { Category, ComponentListItem, Point } from "../types";

interface ComponentPanelProps {
  catalog: ComponentListItem[];
  selectedCategory: Category;
  selectedComponentIds: Partial<Record<Category, number>>;
  categoryAngles: Partial<Record<Category, number>>;
  categoryPositions: Partial<Record<Category, Point>>;
  onSelectCategory: (category: Category) => void;
  onSelectComponent: (category: Category, componentId: number) => void;
  onSetCategoryAngle: (category: Category, angleDeg: number) => void;
  onNudgeCategory: (category: Category, dx: number, dy: number) => void;
  onResetCategory: (category: Category) => void;
}

export function ComponentPanel({
  catalog,
  selectedCategory,
  selectedComponentIds,
  categoryAngles,
  categoryPositions,
  onSelectCategory,
  onSelectComponent,
  onSetCategoryAngle,
  onNudgeCategory,
  onResetCategory,
}: ComponentPanelProps) {
  const [expandedCategory, setExpandedCategory] = useState<Category | null>(null);

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
          const selectedId = selectedComponentIds[category] ?? options[0]?.id;
          const isSelectedCategory = selectedCategory === category;
          const isExpanded = expandedCategory === category;
          const angleDeg = categoryAngles[category] ?? 0;
          const pos = categoryPositions[category];

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
                <h3>{CATEGORY_LABELS[category]}</h3>
                <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                  {angleDeg !== 0 ? `${angleDeg.toFixed(1)}°` : ""}
                  {isExpanded ? " ▲" : " ▼"}
                </span>
              </header>

              <label onClick={(e) => e.stopPropagation()}>
                <span>Part</span>
                <select
                  value={selectedId ?? ""}
                  onChange={(event) => onSelectComponent(category, Number(event.target.value))}
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.full_code}
                    </option>
                  ))}
                </select>
              </label>

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
