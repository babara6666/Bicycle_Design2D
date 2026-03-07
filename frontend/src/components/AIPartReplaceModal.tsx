import { useEffect, useMemo, useRef, useState } from "react";

import { CATEGORY_LABELS } from "../constants";
import { captureSvgMarkupToPng } from "../utils/capture";
import { authedFetch } from "../utils/authedFetch";
import { removeBackground } from "../utils/imageUtils";
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
  selectedPartPreviews: Partial<Record<string, string | null>>;
  captureTargetMask: (category: string) => Promise<string | null>;
  defaultCategory?: string;
  designName: string;
  onApplyToCanvas?: (category: string, imageDataUrl: string) => void;
}

export default function AIPartReplaceModal({
  isOpen,
  onClose,
  originalImage,
  selectedParts,
  selectedPartPreviews,
  captureTargetMask,
  defaultCategory,
  designName,
  onApplyToCanvas,
}: AIPartReplaceModalProps) {
  const availableCategories = useMemo(
    () => Object.keys(CATEGORY_LABELS).filter((key) => selectedParts[key] != null),
    [selectedParts],
  );

  const [targetCategory, setTargetCategory] = useState(defaultCategory ?? "head_tube");
  const [partImage, setPartImage] = useState<string | null>(null);
  const [partImageName, setPartImageName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<AIVersion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [currentPartImage, setCurrentPartImage] = useState<string | null>(null);
  const [targetMaskImage, setTargetMaskImage] = useState<string | null>(null);
  const [bgRemovedIds, setBgRemovedIds] = useState<Set<number>>(new Set());
  const [removingBg, setRemovingBg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedVersion = versions.find((version) => version.id === selectedId) ?? null;

  const getPartLabel = (category: string) => {
    const english = CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category;
    const configuredName = selectedParts[category]?.name?.trim();
    return {
      zh: configuredName || english,
      en: english,
      display: configuredName && configuredName !== english ? `${configuredName} (${english})` : english,
    };
  };

  useEffect(() => {
    if (!isOpen) return;
    const preferred =
      defaultCategory && selectedParts[defaultCategory]
        ? defaultCategory
        : availableCategories[0];
    if (preferred) {
      setTargetCategory(preferred);
    }
  }, [availableCategories, defaultCategory, isOpen, selectedParts]);

  useEffect(() => {
    let cancelled = false;

    async function buildCurrentPartImage() {
      const svg = selectedPartPreviews[targetCategory] ?? null;
      if (!svg) {
        setCurrentPartImage(null);
        return;
      }
      try {
        const png = await captureSvgMarkupToPng(svg, "#ffffff", 768);
        if (!cancelled) {
          setCurrentPartImage(png);
        }
      } catch {
        if (!cancelled) {
          setCurrentPartImage(null);
        }
      }
    }

    void buildCurrentPartImage();
    return () => {
      cancelled = true;
    };
  }, [selectedPartPreviews, targetCategory]);

  useEffect(() => {
    let cancelled = false;

    async function buildTargetMask() {
      const mask = await captureTargetMask(targetCategory);
      if (!cancelled) {
        setTargetMaskImage(mask);
      }
    }

    void buildTargetMask();
    return () => {
      cancelled = true;
    };
  }, [captureTargetMask, targetCategory]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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

    const label = getPartLabel(targetCategory);
    const targetPart = selectedParts[targetCategory];
    // currentPartImage and targetMaskImage are optional hints for Gemini;
    // the backend can work without them.
    const partsList = Object.entries(selectedParts)
      .filter(([, part]) => part != null)
      .map(([key, part]) => `- ${CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] || key}: ${part!.name}`)
      .join("\n");

    try {
      const response = await authedFetch("/api/ai/replace-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_image: originalImage,
          current_part_image: currentPartImage,
          part_image: partImage,
          target_mask_image: targetMaskImage,
          part_name_zh: label.zh,
          part_name_en: label.en,
          design_name: designName,
          parts_context: partsList,
        }),
      });

      const data: { image_base64?: string; text?: string; error?: string } = await response.json();
      if (data.error) {
        setError(data.error);
      } else if (data.image_base64) {
        const version: AIVersion = {
          id: versions.length + 1,
          image: `data:image/png;base64,${data.image_base64}`,
          prompt: `Replace ${label.en}${targetPart ? ` (${targetPart.name})` : ""}`,
          text: data.text,
          timestamp: new Date(),
        };
        setVersions((prev) => [...prev, version]);
        setSelectedId(version.id);
      }
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Failed to replace part");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVersion = (id: number) => {
    setVersions((prev) => prev.filter((version) => version.id !== id));
    if (selectedId === id) {
      const remaining = versions.filter((version) => version.id !== id);
      setSelectedId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  };

  const handleDownload = () => {
    if (!selectedVersion) return;
    const anchor = document.createElement("a");
    anchor.href = selectedVersion.image;
    anchor.download = `bicycle2d_replace_v${selectedVersion.id}_${Date.now()}.png`;
    anchor.click();
  };

  const handleRemoveBg = async () => {
    if (!selectedVersion || bgRemovedIds.has(selectedVersion.id)) return;
    setRemovingBg(true);
    try {
      const processed = await removeBackground(selectedVersion.image);
      setVersions((prev) =>
        prev.map((v) => v.id === selectedVersion.id ? { ...v, image: processed } : v)
      );
      setBgRemovedIds((prev) => new Set(prev).add(selectedVersion.id));
    } catch {
      // silently ignore
    } finally {
      setRemovingBg(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ai-overlay">
      <div className="ai-modal ai-modal-lg">
        <div className="ai-modal-header">
          <div className="ai-modal-header-title">
            <div className="ai-modal-icon green">AI</div>
            <div>
              <h2 className="ai-modal-title">AI Replace Part</h2>
              <p className="ai-modal-subtitle">
                Use current part + reference part + target mask for stable replacement.
              </p>
            </div>
          </div>
          <button className="ai-modal-close" onClick={onClose} type="button">
            x
          </button>
        </div>

        <div className="ai-modal-body">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
                Target Part
              </label>
              <select
                value={targetCategory}
                onChange={(event) => setTargetCategory(event.target.value)}
                style={{ width: "100%", border: "1px solid #c9bcab", borderRadius: 10, background: "var(--bg-surface-alt)", color: "var(--text-strong)", padding: "8px 10px", fontFamily: "inherit" }}
              >
                {availableCategories.map((category) => {
                  const label = getPartLabel(category);
                  return (
                    <option key={category} value={category}>
                      {label.display}
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
                Reference Image
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `2px dashed ${partImage ? "var(--ok)" : "#c9bcab"}`, borderRadius: 10, cursor: "pointer", background: partImage ? "#f0faf6" : "var(--bg-surface-alt)", color: partImage ? "var(--ok)" : "var(--text-muted)", fontSize: 13 }}
              >
                {partImageName || "Upload a reference part image"}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
            </div>

            <button
              className="ai-btn ai-btn-primary"
              onClick={() => void handleGenerate()}
              disabled={loading || !originalImage || !partImage}
              type="button"
            >
              {loading ? "Generating..." : versions.length > 0 ? "Generate Again" : "Generate"}
            </button>
          </div>

          <div className="ai-img-grid" style={{ marginBottom: 16 }}>
            <div>
              <p className="ai-img-label">Full Bike Context</p>
              <div className="ai-img-box">
                {originalImage ? <img src={originalImage} alt="Full bike context" /> : <span className="ai-img-placeholder">No full bike image</span>}
              </div>
            </div>
            <div>
              <p className="ai-img-label">Current Target Part</p>
              <div className="ai-img-box">
                {currentPartImage ? <img src={currentPartImage} alt="Current target part" /> : <span className="ai-img-placeholder">Current part preview unavailable</span>}
              </div>
            </div>
            <div>
              <p className="ai-img-label">Reference Input</p>
              <div className="ai-img-box">
                {partImage ? <img src={partImage} alt="Reference input" /> : <span className="ai-img-placeholder">Upload a reference image</span>}
              </div>
            </div>
            <div>
              <p className="ai-img-label">Target Mask</p>
              <div className="ai-img-box">
                {targetMaskImage ? <img src={targetMaskImage} alt="Target mask" /> : <span className="ai-img-placeholder">Target mask unavailable</span>}
              </div>
            </div>
          </div>

          <div className="ai-img-grid">
            <div>
              <p className="ai-img-label">Generated Result{selectedVersion ? ` v${selectedVersion.id}` : ""}</p>
              <div className="ai-img-box">
                {loading ? (
                  <div className="ai-spinner-box">
                    <div className="ai-spinner" style={{ borderTopColor: "var(--ok)" }} />
                    <span className="ai-spinner-label">Generating targeted replacement...</span>
                  </div>
                ) : selectedVersion ? (
                  <img src={selectedVersion.image} alt={`AI version ${selectedVersion.id}`} />
                ) : error ? (
                  <div className="ai-error-box">{error}</div>
                ) : (
                  <span className="ai-img-placeholder">Generate a replacement preview.</span>
                )}
              </div>
            </div>
          </div>

          {selectedVersion?.text ? <div className="ai-text-response">{selectedVersion.text}</div> : null}

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
            <button
              className="ai-btn"
              onClick={() => void handleRemoveBg()}
              disabled={removingBg || bgRemovedIds.has(selectedVersion.id)}
              type="button"
              style={{ background: bgRemovedIds.has(selectedVersion.id) ? "#ccc" : undefined }}
            >
              {removingBg ? "Removing BG…" : bgRemovedIds.has(selectedVersion.id) ? "BG Removed ✓" : "Remove BG"}
            </button>
          ) : null}
          {selectedVersion && onApplyToCanvas ? (
            <button
              className="ai-btn ai-btn-primary"
              onClick={() => {
                onApplyToCanvas(targetCategory, selectedVersion.image);
                onClose();
              }}
              type="button"
            >
              Apply to Canvas
            </button>
          ) : null}
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

