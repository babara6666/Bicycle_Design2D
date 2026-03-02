import { useState } from "react";
import { useGeminiKeyStore } from "../stores/geminiKeyStore";

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GeminiKeyModal({ isOpen, onClose }: GeminiKeyModalProps) {
  const { apiKey, setApiKey, clearApiKey } = useGeminiKeyStore();
  const [draft, setDraft] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setApiKey(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    clearApiKey();
    setDraft("");
  };

  const maskedDisplay = apiKey
    ? apiKey.slice(0, 8) + "••••••••" + apiKey.slice(-4)
    : null;

  return (
    <div className="ai-overlay" onClick={onClose}>
      <div
        className="ai-modal gemini-key-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-header-title">
            <div className="ai-modal-icon amber">🔑</div>
            <div>
              <h2 className="ai-modal-title">Gemini API Key</h2>
              <p className="ai-modal-subtitle">
                輸入您自己的 Google Gemini API Key 以啟用 AI 功能
              </p>
            </div>
          </div>
          <button className="ai-modal-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="ai-modal-body">
          {/* Status badge */}
          <div className={`gemini-key-status ${apiKey ? "set" : "unset"}`}>
            {apiKey ? (
              <>
                <span className="gemini-key-status-dot set" />
                <span>已設定：{maskedDisplay}</span>
              </>
            ) : (
              <>
                <span className="gemini-key-status-dot unset" />
                <span>尚未設定 API Key — AI 功能將停用</span>
              </>
            )}
          </div>

          {/* Input */}
          <div className="gemini-key-input-row">
            <label className="gemini-key-label">API Key</label>
            <div className="gemini-key-input-wrap">
              <input
                className="gemini-key-input"
                type={showKey ? "text" : "password"}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
                placeholder="AIza..."
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="gemini-key-eye"
                type="button"
                onClick={() => setShowKey((v) => !v)}
                title={showKey ? "隱藏" : "顯示"}
              >
                {showKey ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Help text */}
          <p className="gemini-key-help">
            請前往{" "}
            <strong>Google AI Studio</strong>（aistudio.google.com）申請免費 API Key。
            Key 僅儲存在您的瀏覽器本機，不會上傳至伺服器。
          </p>
        </div>

        {/* Footer */}
        <div className="ai-modal-footer">
          {apiKey && (
            <button
              className="ai-btn ai-btn-ghost"
              type="button"
              onClick={handleClear}
            >
              清除 Key
            </button>
          )}
          <button
            className={`ai-btn ${saved ? "ai-btn-green" : "ai-btn-primary"}`}
            type="button"
            onClick={handleSave}
            disabled={draft.trim() === apiKey}
          >
            {saved ? "✓ 已儲存" : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}
