import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (isOpen) {
      setDraft(apiKey);
      setSaved(false);
    }
  }, [apiKey, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    setApiKey(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    clearApiKey();
    setDraft("");
    setSaved(false);
  };

  const maskedDisplay = apiKey
    ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`
    : null;

  return (
    <div className="ai-overlay" onClick={onClose}>
      <div className="ai-modal gemini-key-modal" onClick={(event) => event.stopPropagation()}>
        <div className="ai-modal-header">
          <div className="ai-modal-header-title">
            <div className="ai-modal-icon amber">AI</div>
            <div>
              <h2 className="ai-modal-title">Gemini API Key</h2>
              <p className="ai-modal-subtitle">
                Images are generated with the user&apos;s own Gemini API key.
              </p>
            </div>
          </div>
          <button className="ai-modal-close" onClick={onClose} type="button">
            x
          </button>
        </div>

        <div className="ai-modal-body">
          <div className={`gemini-key-status ${apiKey ? "set" : "unset"}`}>
            {apiKey ? (
              <>
                <span className="gemini-key-status-dot set" />
                <span>Current key: {maskedDisplay}</span>
              </>
            ) : (
              <>
                <span className="gemini-key-status-dot unset" />
                <span>No Gemini API key saved for this browser.</span>
              </>
            )}
          </div>

          <div className="gemini-key-input-row">
            <label className="gemini-key-label">API Key</label>
            <div className="gemini-key-input-wrap">
              <input
                className="gemini-key-input"
                type={showKey ? "text" : "password"}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setSaved(false);
                }}
                placeholder="AIza..."
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="gemini-key-eye"
                type="button"
                onClick={() => setShowKey((value) => !value)}
                title={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <p className="gemini-key-help">
            Get a key from <strong>Google AI Studio</strong>, then paste it here. The key is stored in this
            browser&apos;s local storage and sent as the <code>X-Gemini-Key</code> header for AI image requests.
            The backend will no longer use the server default key.
          </p>
        </div>

        <div className="ai-modal-footer">
          {apiKey ? (
            <button className="ai-btn ai-btn-ghost" type="button" onClick={handleClear}>
              Clear Key
            </button>
          ) : null}
          <button
            className={`ai-btn ${saved ? "ai-btn-green" : "ai-btn-primary"}`}
            type="button"
            onClick={handleSave}
            disabled={draft.trim() === apiKey}
          >
            {saved ? "Saved" : "Save Key"}
          </button>
        </div>
      </div>
    </div>
  );
}
