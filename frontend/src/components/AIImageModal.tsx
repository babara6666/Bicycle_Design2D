import { useState } from "react";

import { authedFetch } from "../utils/authedFetch";
import AIVersionStrip, { type AIVersion } from "./AIVersionStrip";

interface AIImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalImage: string | null;
  onSendToSimilar?: (resultImage: string) => void;
}

const DEFAULT_PROMPT =
  "Based on this 2D AutoCAD bicycle frame drawing, generate a professional marketing " +
  "illustration. Make it look realistic and stylish, maintaining exact proportions. " +
  "Use clean background, professional studio lighting, and sharp details. " +
  "Suitable for product catalogs and client presentations.";

export default function AIImageModal({
  isOpen,
  onClose,
  originalImage,
  onSendToSimilar,
}: AIImageModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [versions, setVersions] = useState<AIVersion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null;

  const handleGenerate = async (promptOverride?: string) => {
    if (!originalImage) return;
    setLoading(true);
    setError(null);

    const prompt = promptOverride ?? (useCustom && customPrompt.trim() ? customPrompt : undefined);

    try {
      const res = await authedFetch("/api/ai/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: originalImage, prompt }),
      });
      const data: { image_base64?: string; text?: string; error?: string } = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.image_base64) {
        const v: AIVersion = {
          id: versions.length + 1,
          image: `data:image/png;base64,${data.image_base64}`,
          prompt: prompt ?? DEFAULT_PROMPT,
          text: data.text,
          timestamp: new Date(),
        };
        setVersions((prev) => [...prev, v]);
        setSelectedId(v.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate image");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVersion = (id: number) => {
    setVersions((prev) => prev.filter((v) => v.id !== id));
    if (selectedId === id) {
      const rem = versions.filter((v) => v.id !== id);
      setSelectedId(rem.length > 0 ? rem[rem.length - 1].id : null);
    }
  };

  const handleDownload = () => {
    if (!selectedVersion) return;
    const a = document.createElement("a");
    a.href = selectedVersion.image;
    a.download = `bicycle2d_marketing_v${selectedVersion.id}_${Date.now()}.png`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div className="ai-overlay">
      <div className="ai-modal">
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-header-title">
            <div className="ai-modal-icon purple">✨</div>
            <div>
              <h2 className="ai-modal-title">AI 行銷宣傳圖</h2>
              <p className="ai-modal-subtitle">Powered by Gemini Nano Banana 2</p>
            </div>
          </div>
          <button className="ai-modal-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="ai-modal-body">
          {/* Prompt mode */}
          <div className="ai-prompt-box">
            <div className="ai-prompt-toggle">
              <button
                className={!useCustom ? "active" : ""}
                onClick={() => setUseCustom(false)}
                type="button"
              >
                預設 Prompt
              </button>
              <button
                className={useCustom ? "active" : ""}
                onClick={() => setUseCustom(true)}
                type="button"
              >
                自訂 Prompt
              </button>
            </div>
            {!useCustom ? (
              <div className="ai-prompt-readonly">{DEFAULT_PROMPT}</div>
            ) : (
              <textarea
                className="ai-textarea"
                rows={3}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="例：請生成適合電動車品牌的行銷插圖，背景使用都市街道場景..."
              />
            )}
          </div>

          {/* Images */}
          <div className="ai-img-grid">
            <div>
              <p className="ai-img-label">原始 2D 圖</p>
              <div className="ai-img-box">
                {originalImage ? (
                  <img src={originalImage} alt="Original 2D drawing" />
                ) : (
                  <span className="ai-img-placeholder">無截圖</span>
                )}
              </div>
            </div>
            <div>
              <p className="ai-img-label">
                AI 行銷圖{selectedVersion && <span style={{ color: "var(--brand)", marginLeft: 6 }}>v{selectedVersion.id}</span>}
              </p>
              <div className="ai-img-box">
                {loading ? (
                  <div className="ai-spinner-box">
                    <div className="ai-spinner" />
                    <span className="ai-spinner-label">AI 正在生成行銷宣傳圖...</span>
                  </div>
                ) : selectedVersion ? (
                  <img src={selectedVersion.image} alt={`AI v${selectedVersion.id}`} />
                ) : error ? (
                  <div className="ai-error-box">{error}</div>
                ) : (
                  <span className="ai-img-placeholder">點擊「開始生成」</span>
                )}
              </div>
            </div>
          </div>

          {selectedVersion?.text && (
            <div className="ai-text-response">{selectedVersion.text}</div>
          )}

          <AIVersionStrip
            versions={versions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDeleteVersion}
            onClearAll={() => { setVersions([]); setSelectedId(null); }}
          />
        </div>

        {/* Footer */}
        <div className="ai-modal-footer">
          {selectedVersion && (
            <>
              <button className="ai-btn ai-btn-green" onClick={handleDownload} type="button">
                ↓ 下載圖片
              </button>
              {onSendToSimilar && (
                <button
                  className="ai-btn ai-btn-ghost"
                  onClick={() => onSendToSimilar(selectedVersion.image)}
                  type="button"
                >
                  相似圖片生成 →
                </button>
              )}
            </>
          )}
          <button
            className="ai-btn ai-btn-primary"
            onClick={() => void handleGenerate()}
            disabled={loading || !originalImage || (useCustom && !customPrompt.trim())}
            type="button"
          >
            {loading ? "生成中..." : versions.length > 0 ? "再次生成" : "開始生成"}
          </button>
        </div>
      </div>
    </div>
  );
}
