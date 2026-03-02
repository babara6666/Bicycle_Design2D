import { useState } from "react";

import { VEHICLES } from "../constants";
import { useGeminiKeyStore } from "../stores/geminiKeyStore";
import type { Vehicle } from "../types";

interface HeaderBarProps {
  vehicle: Vehicle;
  isFreeMode: boolean;
  configurationId: number | null;
  configurationNote: string | null;
  username: string;
  userRole: string;
  onVehicleChange: (vehicle: Vehicle) => void;
  onToggleFreeMode: () => void;
  onSaveNewConfiguration: () => void;
  onUpdateConfigurationConstraints: () => void;
  onLoadConfiguration: (id: number) => void;
  onOpenAIImage: () => void;
  onOpenAIBrandParts: () => void;
  onOpenAIReplacePart: () => void;
  onOpenAISimilar: () => void;
  onOpenDrawing: () => void;
  onOpenGeminiKey: () => void;
  onLogout: () => void;
}

export function HeaderBar({
  vehicle,
  isFreeMode,
  configurationId,
  configurationNote,
  username,
  userRole,
  onVehicleChange,
  onToggleFreeMode,
  onSaveNewConfiguration,
  onUpdateConfigurationConstraints,
  onLoadConfiguration,
  onOpenAIImage,
  onOpenAIBrandParts,
  onOpenAIReplacePart,
  onOpenAISimilar,
  onOpenDrawing,
  onOpenGeminiKey,
  onLogout,
}: HeaderBarProps) {
  const [loadIdInput, setLoadIdInput] = useState("");
  const geminiKeySet = !!useGeminiKeyStore((s) => s.apiKey);

  return (
    <header className="header-bar">
      <div className="header-brand">
        <p className="header-kicker">IBDS</p>
        <h1>Bicycle 2D AutoCAD Editor</h1>
        <p className="header-subline">
          {configurationId ? `Config #${configurationId}` : "Unsaved configuration"}
          {configurationNote ? ` - ${configurationNote}` : ""}
        </p>
      </div>

      <div className="header-actions">
        <label className="control-chip">
          <span>Vehicle</span>
          <select
            value={vehicle}
            onChange={(event) => onVehicleChange(event.target.value as Vehicle)}
          >
            {VEHICLES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <button
          className={`free-mode-toggle ${isFreeMode ? "active" : ""}`}
          onClick={onToggleFreeMode}
          type="button"
        >
          {isFreeMode ? "Free Mode: ON" : "Free Mode: OFF"}
        </button>

        <button className="action-button" onClick={onSaveNewConfiguration} type="button" title="Save as new configuration">
          Save
        </button>

        <button
          className="action-button"
          onClick={onUpdateConfigurationConstraints}
          type="button"
          disabled={!configurationId}
          title="Update current configuration constraints"
        >
          Update
        </button>

        <div className="ai-toolbar">
          <button
            className={`ai-tool-btn key-btn ${geminiKeySet ? "key-set" : "key-unset"}`}
            onClick={onOpenGeminiKey}
            type="button"
            title={geminiKeySet ? "Gemini API Key 已設定，點擊修改" : "尚未設定 Gemini API Key，點擊輸入"}
          >
            🔑
          </button>
          <button className="ai-tool-btn purple" onClick={onOpenAIImage} type="button" title="AI 行銷宣傳圖" disabled={!geminiKeySet}>
            ✨ 行銷圖
          </button>
          <button className="ai-tool-btn amber" onClick={onOpenAIBrandParts} type="button" title="AI 他牌零件生成" disabled={!geminiKeySet}>
            ⚙ 他牌
          </button>
          <button className="ai-tool-btn green" onClick={onOpenAIReplacePart} type="button" title="AI 零件替換" disabled={!geminiKeySet}>
            ⇄ 替換
          </button>
          <button className="ai-tool-btn cyan" onClick={onOpenAISimilar} type="button" title="AI 相似圖片生成" disabled={!geminiKeySet}>
            ⊙ 相似
          </button>
          <button className="ai-tool-btn red" onClick={onOpenDrawing} type="button" title="出圖 / 匯出 DWG">
            ⬇ 出圖
          </button>
        </div>

        <label className="control-chip load-chip">
          <span>Load #</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={loadIdInput}
            onChange={(event) => setLoadIdInput(event.target.value)}
            placeholder="id"
          />
          <button
            className="inline-load-button"
            onClick={() => {
              const parsed = Number(loadIdInput);
              if (Number.isInteger(parsed) && parsed > 0) {
                onLoadConfiguration(parsed);
              }
            }}
            type="button"
          >
            Load
          </button>
        </label>

        {/* User badge + logout */}
        <div className="header-user-badge">
          <span className="header-user-name">{username}</span>
          <span className={`header-user-role role-${userRole}`}>{userRole}</span>
          <button className="header-logout-btn" onClick={onLogout} type="button">
            登出
          </button>
        </div>
      </div>
    </header>
  );
}
