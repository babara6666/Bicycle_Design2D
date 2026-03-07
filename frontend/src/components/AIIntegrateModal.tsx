import { useState } from "react";

import { authedFetch } from "../utils/authedFetch";
import AIVersionStrip, { type AIVersion } from "./AIVersionStrip";

interface AIIntegrateModalProps {
  isOpen: boolean;
  onClose: () => void;
  combinedCanvas: string | null; // SVG capture WITH overlays visible
  partNamesEn: string;           // e.g. "Down Tube, Top Tube"
  partNamesZh: string;
}

export default function AIIntegrateModal({
  isOpen,
  onClose,
  combinedCanvas,
  partNamesEn,
  partNamesZh,
}: AIIntegrateModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<AIVersion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null;

  const handleGenerate = async () => {
    if (!combinedCanvas) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await authedFetch("/api/ai/integrate-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          combined_canvas: combinedCanvas,
          part_names_en: partNamesEn,
          part_names_zh: partNamesZh,
        }),
      });
      const data: { image_base64?: string; text?: string; error?: string } = await resp.json();
      if (data.error) {
        setError(data.error);
      } else if (data.image_base64) {
        const version: AIVersion = {
          id: versions.length + 1,
          image: `data:image/png;base64,${data.image_base64}`,
          prompt: `Integrate: ${partNamesEn}`,
          text: data.text,
          timestamp: new Date(),
        };
        setVersions((prev) => [...prev, version]);
        setSelectedId(version.id);
      }
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Failed to integrate part");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVersion = (id: number) => {
    setVersions((prev) => prev.filter((v) => v.id !== id));
    if (selectedId === id) {
      const remaining = versions.filter((v) => v.id !== id);
      setSelectedId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  };

  const handleDownload = () => {
    if (!selectedVersion) return;
    const a = document.createElement("a");
    a.href = selectedVersion.image;
    a.download = `bicycle2d_integrated_v${selectedVersion.id}_${Date.now()}.png`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div className="ai-overlay">
      <div className="ai-modal ai-modal-lg">
        <div className="ai-modal-header">
          <div className="ai-modal-header-title">
            <div className="ai-modal-icon green">AI</div>
            <div>
              <h2 className="ai-modal-title">AI Integrate Part</h2>
              <p className="ai-modal-subtitle">
                Blend the placed overlay seamlessly into the bicycle drawing.
              </p>
            </div>
          </div>
          <button className="ai-modal-close" onClick={onClose} type="button">
            x
          </button>
        </div>

        <div className="ai-modal-body">
          {/* Top: part names + generate button */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
                Parts to Integrate
              </label>
              <div style={{ padding: "8px 12px", border: "1px solid #c9bcab", borderRadius: 10, background: "var(--bg-surface-alt)", color: "var(--text-strong)", fontSize: 13 }}>
                {partNamesEn || "—"}
              </div>
            </div>
            <button
              className="ai-btn ai-btn-primary"
              onClick={() => void handleGenerate()}
              disabled={loading || !combinedCanvas}
              type="button"
            >
              {loading ? "Integrating..." : versions.length > 0 ? "Integrate Again" : "Integrate"}
            </button>
          </div>

          {/* Preview row: input canvas + result */}
          <div className="ai-img-grid" style={{ marginBottom: 16 }}>
            <div>
              <p className="ai-img-label">Drawing With Overlay (Input)</p>
              <div className="ai-img-box">
                {combinedCanvas
                  ? <img src={combinedCanvas} alt="Drawing with overlay" />
                  : <span className="ai-img-placeholder">No canvas captured</span>}
              </div>
            </div>
            <div>
              <p className="ai-img-label">Integrated Result{selectedVersion ? ` v${selectedVersion.id}` : ""}</p>
              <div className="ai-img-box">
                {loading ? (
                  <div className="ai-spinner-box">
                    <div className="ai-spinner" style={{ borderTopColor: "#1a9e5c" }} />
                    <span className="ai-spinner-label">Integrating part into drawing…</span>
                  </div>
                ) : selectedVersion ? (
                  <img src={selectedVersion.image} alt={`Integrated v${selectedVersion.id}`} />
                ) : error ? (
                  <div className="ai-error-box">{error}</div>
                ) : (
                  <span className="ai-img-placeholder">Click Integrate to generate.</span>
                )}
              </div>
            </div>
          </div>

          {selectedVersion?.text ? (
            <div className="ai-text-response">{selectedVersion.text}</div>
          ) : null}

          <AIVersionStrip
            versions={versions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDeleteVersion}
            onClearAll={() => {
              setVersions([]);
              setSelectedId(null);
            }}
          />
        </div>

        <div className="ai-modal-footer">
          {selectedVersion ? (
            <button className="ai-btn ai-btn-green" onClick={handleDownload} type="button">
              Download
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
