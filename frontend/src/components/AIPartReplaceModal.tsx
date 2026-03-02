import { useRef, useState } from "react";

import { authedFetch } from "../utils/authedFetch";
import AIVersionStrip, { type AIVersion } from "./AIVersionStrip";

interface SelectedPart {
  id: number;
  name: string;
  category: string;
}

interface AIPartReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalImage: string | null;
  selectedParts: Partial<Record<string, SelectedPart>>;
  designName: string;
}

const CATEGORY_LABELS: Record<string, { zh: string; en: string }> = {
  head_tube:   { zh: "頭管", en: "Head Tube" },
  top_tube:    { zh: "上管", en: "Top Tube" },
  down_tube:   { zh: "下管", en: "Down Tube" },
  seat_tube:   { zh: "中管", en: "Seat Tube" },
  motor_mount: { zh: "馬達座", en: "Motor Mount" },
  seat_stay:   { zh: "上叉", en: "Seat Stay" },
  chain_stay:  { zh: "下叉", en: "Chain Stay" },
  fork_end:    { zh: "叉片", en: "Fork End" },
};

export default function AIPartReplaceModal({
  isOpen,
  onClose,
  originalImage,
  selectedParts,
  designName,
}: AIPartReplaceModalProps) {
  const [targetCategory, setTargetCategory] = useState("head_tube");
  const [partImage, setPartImage] = useState<string | null>(null);
  const [partImageName, setPartImageName] = useState("");
  const [refType, setRefType] = useState<"full_bike" | "single_part">("single_part");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<AIVersion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null;
  const availableCategories = Object.keys(CATEGORY_LABELS).filter(
    (k) => selectedParts[k] != null,
  );

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPartImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => setPartImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!originalImage || !partImage) return;
    setLoading(true);
    setError(null);

    const label = CATEGORY_LABELS[targetCategory] ?? { zh: targetCategory, en: targetCategory };
    const partsList = Object.entries(selectedParts)
      .filter(([, p]) => p != null)
      .map(([key, p]) => `  - ${CATEGORY_LABELS[key]?.en || key}: ${p!.name}`)
      .join("\n");

    try {
      const res = await authedFetch("/api/ai/replace-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_image: originalImage,
          part_image: partImage,
          part_name_zh: label.zh,
          part_name_en: label.en,
          design_name: designName,
          parts_context: partsList,
          ref_type: refType,
        }),
      });
      const data: { image_base64?: string; text?: string; error?: string } = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.image_base64) {
        const v: AIVersion = {
          id: versions.length + 1,
          image: `data:image/png;base64,${data.image_base64}`,
          prompt: `Replace ${label.en}`,
          text: data.text,
          timestamp: new Date(),
        };
        setVersions((prev) => [...prev, v]);
        setSelectedId(v.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
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
    a.download = `bicycle2d_replace_v${selectedVersion.id}_${Date.now()}.png`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div className="ai-overlay">
      <div className="ai-modal">
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-header-title">
            <div className="ai-modal-icon green">⇄</div>
            <div>
              <h2 className="ai-modal-title">AI 零件替換</h2>
              <p className="ai-modal-subtitle">上傳新零件圖片，AI 自動替換到 2D 圖面</p>
            </div>
          </div>
          <button className="ai-modal-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="ai-modal-body">
          {/* Controls */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "flex-end" }}>
            {/* Part selector */}
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
                要替換的零件
              </label>
              <select
                value={targetCategory}
                onChange={(e) => setTargetCategory(e.target.value)}
                style={{ width: "100%", border: "1px solid #c9bcab", borderRadius: 10, background: "var(--bg-surface-alt)", color: "var(--text-strong)", padding: "8px 10px", fontFamily: "inherit" }}
              >
                {availableCategories.map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_LABELS[k]?.zh} ({CATEGORY_LABELS[k]?.en})
                    {selectedParts[k] ? ` — ${selectedParts[k]!.name}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Part image upload */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
                參考圖片
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `2px dashed ${partImage ? "var(--ok)" : "#c9bcab"}`, borderRadius: 10, cursor: "pointer", background: partImage ? "#f0faf6" : "var(--bg-surface-alt)", color: partImage ? "var(--ok)" : "var(--text-muted)", fontSize: 13 }}
              >
                ↑ {partImageName || "點擊上傳圖片"}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} style={{ display: "none" }} />
            </div>

            {/* Ref type */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
                圖片類型
              </label>
              <div style={{ display: "flex", border: "1px solid #c9bcab", borderRadius: 10, overflow: "hidden", fontSize: 13 }}>
                <button
                  onClick={() => setRefType("single_part")}
                  style={{ flex: 1, padding: "8px 12px", background: refType === "single_part" ? "var(--ok)" : "var(--bg-surface-alt)", color: refType === "single_part" ? "#fff" : "var(--text-muted)", border: "none", cursor: "pointer", fontWeight: 600 }}
                  type="button"
                >
                  單一零件
                </button>
                <button
                  onClick={() => setRefType("full_bike")}
                  style={{ flex: 1, padding: "8px 12px", background: refType === "full_bike" ? "var(--ok)" : "var(--bg-surface-alt)", color: refType === "full_bike" ? "#fff" : "var(--text-muted)", border: "none", cursor: "pointer", fontWeight: 600 }}
                  type="button"
                >
                  整車圖
                </button>
              </div>
            </div>

            <button
              className="ai-btn ai-btn-primary"
              onClick={() => void handleGenerate()}
              disabled={loading || !originalImage || !partImage}
              type="button"
            >
              {loading ? "生成中..." : versions.length > 0 ? "再次生成" : "開始生成"}
            </button>
          </div>

          {/* Part preview */}
          {partImage && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>零件參考圖：</span>
              <img src={partImage} alt="part" style={{ height: 64, width: "auto", borderRadius: 8, border: "1px solid #d6cbb8", objectFit: "contain", background: "#f4efe5" }} />
            </div>
          )}

          {/* Images */}
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
                AI 替換結果{selectedVersion && <span style={{ color: "var(--ok)", marginLeft: 6 }}>v{selectedVersion.id}</span>}
              </p>
              <div className="ai-img-box">
                {loading ? (
                  <div className="ai-spinner-box">
                    <div className="ai-spinner" style={{ borderTopColor: "var(--ok)" }} />
                    <span className="ai-spinner-label">AI 正在替換零件...</span>
                  </div>
                ) : selectedVersion ? (
                  <img src={selectedVersion.image} alt={`AI v${selectedVersion.id}`} />
                ) : error ? (
                  <div className="ai-error-box">{error}</div>
                ) : (
                  <span className="ai-img-placeholder">選擇零件 + 上傳參考圖片後點擊「開始生成」</span>
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
        </div>
      </div>
    </div>
  );
}
