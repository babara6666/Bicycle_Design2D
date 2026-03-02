import { useRef, useState } from "react";

import { authedFetch } from "../utils/authedFetch";
import AIVersionStrip, { type AIVersion } from "./AIVersionStrip";

interface AISimilarImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  bicycleImage: string | null;
}

const EXAMPLE_PROMPTS = [
  "請使用原本的 2D 車架幾何，渲染成這張參考圖片的顏色和塗裝風格",
  "請將腳踏車的配色改成跟參考圖片中的腳踏車一樣，保持 2D 圖幾何比例",
  "參考這張圖片的設計風格，重新渲染我的 2D 腳踏車車架",
  "請模仿參考圖片中的碳纖維紋理風格，應用到我的 2D 車架上",
];

export default function AISimilarImageModal({
  isOpen,
  onClose,
  bicycleImage,
}: AISimilarImageModalProps) {
  const [loading, setLoading] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<AIVersion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setReferenceImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!bicycleImage || !referenceImage || !userPrompt.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await authedFetch("/api/ai/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bicycle_image: bicycleImage,
          reference_image: referenceImage,
          user_prompt: userPrompt,
        }),
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
    a.download = `bicycle2d_similar_v${selectedVersion.id}_${Date.now()}.png`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div className="ai-overlay">
      <div className="ai-modal ai-modal-lg">
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-header-title">
            <div className="ai-modal-icon cyan">⊙</div>
            <div>
              <h2 className="ai-modal-title">AI 相似圖片生成</h2>
              <p className="ai-modal-subtitle">上傳參考圖片，讓 AI 融合到你的 2D 車架設計</p>
            </div>
          </div>
          <button className="ai-modal-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="ai-modal-body">
          <div className="ai-img-grid" style={{ marginBottom: 16, marginTop: 0 }}>
            {/* Reference upload */}
            <div>
              <p className="ai-img-label">上傳參考圖片</p>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: "none" }} />
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ borderRadius: 14, border: `2px dashed ${referenceImage ? "var(--brand)" : "#c9bcab"}`, background: referenceImage ? "#eaf4fd" : "#faf7f2", minHeight: 140, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" }}
              >
                {referenceImage ? (
                  <img src={referenceImage} alt="Reference" style={{ width: "100%", maxHeight: 180, objectFit: "contain" }} />
                ) : (
                  <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>↑</div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>點擊上傳參考圖片</p>
                    <p style={{ margin: "4px 0 0", fontSize: 11 }}>支援 JPG、PNG、WebP</p>
                  </div>
                )}
              </div>
              {referenceImage && (
                <button
                  onClick={() => { setReferenceImage(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  style={{ marginTop: 6, fontSize: 12, color: "#b94949", background: "transparent", border: "none", cursor: "pointer" }}
                  type="button"
                >
                  ✕ 移除圖片
                </button>
              )}
            </div>

            {/* Prompt */}
            <div>
              <p className="ai-img-label">輸入指示</p>
              <textarea
                className="ai-textarea"
                rows={5}
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="例：請使用原本的 2D 車架幾何，渲染成這張參考圖片的顏色和塗裝風格"
              />
              <div className="ai-chips" style={{ marginTop: 6 }}>
                {EXAMPLE_PROMPTS.map((p, i) => (
                  <button key={i} className="ai-chip" onClick={() => setUserPrompt(p)} type="button" title={p}>
                    {p.length > 30 ? p.slice(0, 30) + "…" : p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Images */}
          <div className="ai-img-grid">
            <div>
              <p className="ai-img-label">腳踏車原始圖</p>
              <div className="ai-img-box">
                {bicycleImage ? (
                  <img src={bicycleImage} alt="Bicycle" />
                ) : (
                  <span className="ai-img-placeholder">無原始圖（請先透過 AI 行銷圖 產生）</span>
                )}
              </div>
            </div>
            <div>
              <p className="ai-img-label">
                AI 生成結果{selectedVersion && <span style={{ color: "var(--brand)", marginLeft: 6 }}>v{selectedVersion.id}</span>}
              </p>
              <div className="ai-img-box">
                {loading ? (
                  <div className="ai-spinner-box">
                    <div className="ai-spinner" />
                    <span className="ai-spinner-label">AI 正在融合圖片中...</span>
                  </div>
                ) : selectedVersion ? (
                  <img src={selectedVersion.image} alt={`AI v${selectedVersion.id}`} />
                ) : error ? (
                  <div className="ai-error-box">{error}</div>
                ) : (
                  <span className="ai-img-placeholder">上傳參考圖片並輸入指示後點擊「開始生成」</span>
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
            disabled={loading || !bicycleImage || !referenceImage || !userPrompt.trim()}
            type="button"
          >
            {loading ? "生成中..." : versions.length > 0 ? "再次生成" : "開始生成"}
          </button>
        </div>
      </div>
    </div>
  );
}
