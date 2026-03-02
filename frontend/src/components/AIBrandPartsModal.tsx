import { useState } from "react";

import { authedFetch } from "../utils/authedFetch";
import AIVersionStrip, { type AIVersion } from "./AIVersionStrip";

interface AIBrandPartsModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalImage: string | null;
}

const EXAMPLE_PROMPTS = [
  "請幫我以這個 2D 車架為基底，將頭管替換為 Giant Anthem Advanced 29 的頭管造型",
  "請將下管替換為 Merida Scultura 的空氣力學下管設計",
  "請將座管替換為碳纖維一體式座管，類似 Specialized Tarmac SL7 的造型",
  "請將上管改為 Trek Madone 的隱藏式走線上管設計",
];

export default function AIBrandPartsModal({
  isOpen,
  onClose,
  originalImage,
}: AIBrandPartsModalProps) {
  const [loading, setLoading] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<AIVersion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null;

  const handleGenerate = async () => {
    if (!originalImage || !userPrompt.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await authedFetch("/api/ai/brand-parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: originalImage, user_prompt: userPrompt }),
      });
      const data: { image_base64?: string; text?: string; error?: string } = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.image_base64) {
        const v: AIVersion = {
          id: versions.length + 1,
          image: `data:image/png;base64,${data.image_base64}`,
          prompt: userPrompt,
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
    a.download = `bicycle2d_brand_v${selectedVersion.id}_${Date.now()}.png`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div className="ai-overlay">
      <div className="ai-modal ai-modal-lg">
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-header-title">
            <div className="ai-modal-icon amber">⚙</div>
            <div>
              <h2 className="ai-modal-title">AI 他牌零件生成</h2>
              <p className="ai-modal-subtitle">以你的 2D 車架為基底，探索其他品牌零件造型</p>
            </div>
          </div>
          <button className="ai-modal-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="ai-modal-body">
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              輸入需求
            </label>
            <textarea
              className="ai-textarea"
              rows={3}
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="例：請幫我以這個 2D 車架為基底，將頭管替換為 Giant Anthem Advanced 29 的頭管造型"
            />
            <div className="ai-chips">
              {EXAMPLE_PROMPTS.map((p, i) => (
                <button key={i} className="ai-chip" onClick={() => setUserPrompt(p)} type="button" title={p}>
                  {p.length > 36 ? p.slice(0, 36) + "…" : p}
                </button>
              ))}
            </div>
          </div>

          <div className="ai-img-grid">
            <div>
              <p className="ai-img-label">原始 2D 圖</p>
              <div className="ai-img-box">
                {originalImage ? (
                  <img src={originalImage} alt="Original" />
                ) : (
                  <span className="ai-img-placeholder">無截圖</span>
                )}
              </div>
            </div>
            <div>
              <p className="ai-img-label">
                AI 生成結果{selectedVersion && <span style={{ color: "var(--brand-2)", marginLeft: 6 }}>v{selectedVersion.id}</span>}
              </p>
              <div className="ai-img-box">
                {loading ? (
                  <div className="ai-spinner-box">
                    <div className="ai-spinner" style={{ borderTopColor: "var(--brand-2)" }} />
                    <span className="ai-spinner-label">AI 正在生成他牌零件...</span>
                  </div>
                ) : selectedVersion ? (
                  <img src={selectedVersion.image} alt={`AI v${selectedVersion.id}`} />
                ) : error ? (
                  <div className="ai-error-box">{error}</div>
                ) : (
                  <span className="ai-img-placeholder">輸入需求後點擊「開始生成」</span>
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
            <button className="ai-btn ai-btn-green" onClick={handleDownload} type="button">
              ↓ 下載圖片
            </button>
          )}
          <button
            className="ai-btn ai-btn-primary"
            onClick={() => void handleGenerate()}
            disabled={loading || !originalImage || !userPrompt.trim()}
            type="button"
          >
            {loading ? "生成中..." : versions.length > 0 ? "再次生成" : "開始生成"}
          </button>
        </div>
      </div>
    </div>
  );
}
