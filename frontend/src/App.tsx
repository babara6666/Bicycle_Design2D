import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, useSearchParams } from "react-router-dom";
import AIBrandPartsModal from "./components/AIBrandPartsModal";
import AIImageModal from "./components/AIImageModal";
import AIIntegrateModal from "./components/AIIntegrateModal";
import AIPartReplaceModal from "./components/AIPartReplaceModal";
import AISimilarImageModal from "./components/AISimilarImageModal";
import DrawingProgressModal from "./components/DrawingProgressModal";
import GeminiKeyModal from "./components/GeminiKeyModal";
import { ComponentPanel } from "./components/ComponentPanel";
import { GeometryPanel } from "./components/GeometryPanel";
import { HeaderBar } from "./components/HeaderBar";
import { Viewer2D, type Viewer2DHandle, type AiOverlay } from "./components/Viewer2D";
import { CATEGORY_LABELS, REQUIRED_NODES } from "./constants";
import { useEditorStore } from "./stores/editorStore";
import type { Category, ComponentDetail, Vehicle } from "./types";
import { captureSvgCategoryMaskToPng, captureSvgToPng } from "./utils/capture";
import LandingPage from "./pages/LandingPage";
import DesignPickerPage from "./pages/DesignPickerPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/designs/:typeCode" element={<DesignPickerPage />} />
        <Route path="/editor" element={<AuthenticatedApp username="dev" role="admin" onLogout={() => {}} />} />
        <Route path="*" element={<AuthenticatedApp username="dev" role="admin" onLogout={() => {}} />} />
      </Routes>
    </BrowserRouter>
  );
}

interface AuthenticatedAppProps {
  username: string;
  role: string;
  onLogout: () => void;
}

function AuthenticatedApp({ username, role, onLogout }: AuthenticatedAppProps) {
  const viewerRef = useRef<Viewer2DHandle | null>(null);
  const [aiCapture, setAiCapture] = useState<string | null>(null);
  const [aiLastMarketingResult, setAiLastMarketingResult] = useState<string | null>(null);
  const [aiImageOpen, setAiImageOpen] = useState(false);
  const [aiBrandOpen, setAiBrandOpen] = useState(false);
  const [aiReplaceOpen, setAiReplaceOpen] = useState(false);
  const [aiSimilarOpen, setAiSimilarOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [geminiKeyOpen, setGeminiKeyOpen] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [hiddenCategories, setHiddenCategories] = useState<Set<Category>>(new Set());
  const [aiOverlays, setAiOverlays] = useState<Partial<Record<Category, AiOverlay>>>({});
  const [selectedAiCategory, setSelectedAiCategory] = useState<Category | null>(null);
  const [aiIntegrateOpen, setAiIntegrateOpen] = useState(false);
  const [aiIntegrateCanvas, setAiIntegrateCanvas] = useState<string | null>(null);
  const [aiIntegratePartNames, setAiIntegratePartNames] = useState("");

  const ensureAiViewReady = useCallback(async () => {
    viewerRef.current?.fitToContent();
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }, []);

  const captureViewer = useCallback(async (): Promise<string | null> => {
    const svgElement = viewerRef.current?.getSvgElement();
    if (!svgElement) return null;

    await ensureAiViewReady();
    try {
      const png = await captureSvgToPng(svgElement, "#f4ece0", { sanitizeForAi: true });
      setAiCapture(png);
      return png;
    } catch {
      return null;
    }
  }, [ensureAiViewReady]);

  const captureTargetMask = useCallback(async (category: string): Promise<string | null> => {
    const svgElement = viewerRef.current?.getSvgElement();
    if (!svgElement) return null;

    await ensureAiViewReady();
    try {
      return await captureSvgCategoryMaskToPng(svgElement, category);
    } catch {
      return null;
    }
  }, [ensureAiViewReady]);

  const handleApplyAiOverlay = useCallback((category: string, imageDataUrl: string) => {
    // Read natural image dimensions so the overlay box matches the actual content.
    // Normalise so the longer side is at most 300 render units.
    const img = new window.Image();
    img.onload = () => {
      const MAX = 300;
      const w = img.naturalWidth  || MAX;
      const h = img.naturalHeight || MAX;
      const ratio = Math.min(MAX / w, MAX / h);
      const naturalW = Math.round(w * ratio);
      const naturalH = Math.round(h * ratio);
      setAiOverlays((prev) => ({
        ...prev,
        [category]: {
          imageDataUrl,
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: 1,
          flipX: false,
          naturalW,
          naturalH,
        } satisfies AiOverlay,
      }));
    };
    img.onerror = () => {
      // Fallback if image can't be measured
      setAiOverlays((prev) => ({
        ...prev,
        [category]: {
          imageDataUrl,
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: 1,
          flipX: false,
          naturalW: 300,
          naturalH: 300,
        } satisfies AiOverlay,
      }));
    };
    img.src = imageDataUrl;
  }, []);

  const handleMoveAiOverlay = useCallback((category: Category, position: { x: number; y: number }) => {
    setAiOverlays((prev) => {
      const existing = prev[category];
      if (!existing) return prev;
      return { ...prev, [category]: { ...existing, position } };
    });
  }, []);

  const handleToggleHideCategory = useCallback((category: Category) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const handleUpdateAiOverlay = useCallback((
    category: Category,
    updates: Partial<Pick<AiOverlay, "rotation" | "scale" | "flipX">>,
  ) => {
    setAiOverlays((prev) => {
      const existing = prev[category];
      if (!existing) return prev;
      return { ...prev, [category]: { ...existing, ...updates } };
    });
  }, []);

  const openAIIntegrate = useCallback(async () => {
    const svgElement = viewerRef.current?.getSvgElement();
    if (!svgElement) return;

    const overlayCategories = Object.keys(aiOverlays) as Category[];
    if (overlayCategories.length === 0) return;

    await ensureAiViewReady();
    // Capture combined canvas WITH overlays visible — same pipeline as captureViewer,
    // omit sanitizeForAi so overlay <image> elements are included in the screenshot
    const combinedCanvas = await captureSvgToPng(svgElement, "#f4ece0");
    if (!combinedCanvas) return;

    const partNamesEn = overlayCategories
      .map((cat) => (CATEGORY_LABELS as Record<string, string>)[cat] ?? cat)
      .join(", ");

    setAiIntegrateCanvas(combinedCanvas);
    setAiIntegratePartNames(partNamesEn);
    setAiIntegrateOpen(true);
  }, [ensureAiViewReady, aiOverlays]);

  const handleRemoveAiOverlay = useCallback((category: Category) => {
    setAiOverlays((prev) => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
  }, []);

  const openAIImage = useCallback(async () => {
    await captureViewer();
    setAiImageOpen(true);
  }, [captureViewer]);

  const openAIBrandParts = useCallback(async () => {
    await captureViewer();
    setAiBrandOpen(true);
  }, [captureViewer]);

  const openAIReplacePart = useCallback(async () => {
    await captureViewer();
    setAiReplaceOpen(true);
  }, [captureViewer]);

  const openAISimilar = useCallback(async () => {
    await ensureAiViewReady();
    setAiSimilarOpen(true);
  }, [ensureAiViewReady]);

  const {
    vehicle,
    skeleton,
    catalog,
    componentDetails,
    selectedComponentIds,
    selectedCategory,
    configurationId,
    configurationNote,
    paPosition,
    pbPosition,
    categoryPositions,
    headTubeAngleDeg,
    categoryAngles,
    seatTubeAxisLock,
    isFreeMode,
    isLoading,
    error,
    initialize,
    setVehicle,
    selectCategory,
    selectComponent,
    setPaPosition,
    setPbPosition,
    setHeadTubeAngleDeg,
    setCategoryPosition,
    setCategoryAngle,
    nudgeCategory,
    resetCategoryToDefault,
    setSeatTubeAxisLock,
    toggleFreeMode,
    saveNewConfiguration,
    updateConfigurationConstraints,
    loadConfiguration,
    confirmPaPb,
  } = useEditorStore();

  const [searchParams] = useSearchParams();
  const requestedVehicle = (searchParams.get("vehicle") as Vehicle | null) ?? undefined;

  useEffect(() => {
    void initialize(requestedVehicle);
  }, [initialize, requestedVehicle]);

  const selectedComponents = useMemo(() => {
    const details: ComponentDetail[] = [];
    for (const id of Object.values(selectedComponentIds)) {
      const item = componentDetails[id];
      if (item) {
        details.push(item);
      }
    }
    return details;
  }, [componentDetails, selectedComponentIds]);

  const missingNodes = useMemo(() => {
    const available = new Set(Object.keys(skeleton?.nodes ?? {}));
    return REQUIRED_NODES.filter((node) => !available.has(node));
  }, [skeleton?.nodes]);

  const seatTubePosition = categoryPositions.seat_tube ?? null;

  return (
    <div className="app-shell">
      <HeaderBar
        vehicle={vehicle}
        isFreeMode={isFreeMode}
        configurationId={configurationId}
        configurationNote={configurationNote}
        username={username}
        userRole={role}
        onVehicleChange={(nextVehicle) => void setVehicle(nextVehicle)}
        onToggleFreeMode={toggleFreeMode}
        onSaveNewConfiguration={() => void saveNewConfiguration()}
        onUpdateConfigurationConstraints={() => void updateConfigurationConstraints()}
        onLoadConfiguration={(id) => void loadConfiguration(id)}
        onOpenAIImage={() => void openAIImage()}
        onOpenAIBrandParts={() => void openAIBrandParts()}
        onOpenAIReplacePart={() => void openAIReplacePart()}
        onOpenAIIntegrate={() => void openAIIntegrate()}
        hasAiOverlays={Object.keys(aiOverlays).length > 0}
        onOpenAISimilar={() => void openAISimilar()}
        onOpenDrawing={() => setDrawingOpen(true)}
        onOpenGeminiKey={() => setGeminiKeyOpen(true)}
        onLogout={onLogout}
      />

      <main className="workspace-grid">
        <aside className="sidebar">
          <GeometryPanel
            headTubeAngleDeg={headTubeAngleDeg}
            paPosition={paPosition}
            pbPosition={pbPosition}
            seatTubePosition={seatTubePosition}
            seatTubeAxisLock={seatTubeAxisLock}
            isFreeMode={isFreeMode}
            missingNodes={missingNodes}
            onHeadTubeAngleChange={setHeadTubeAngleDeg}
            onPaPositionChange={setPaPosition}
            onPbPositionChange={setPbPosition}
            onSeatTubePositionChange={(point) => setCategoryPosition("seat_tube", point)}
            onSeatTubeAxisLockChange={setSeatTubeAxisLock}
            onConfirmPaPb={() => void confirmPaPb()}
          />

          <ComponentPanel
            catalog={catalog}
            selectedCategory={selectedCategory}
            selectedComponentIds={selectedComponentIds}
            categoryAngles={categoryAngles}
            categoryPositions={categoryPositions}
            hiddenCategories={hiddenCategories}
            onSelectCategory={selectCategory}
            onSelectComponent={(category, id) => void selectComponent(category, id)}
            onSetCategoryAngle={setCategoryAngle}
            onNudgeCategory={nudgeCategory}
            onResetCategory={resetCategoryToDefault}
            onToggleHideCategory={handleToggleHideCategory}
          />
        </aside>

        <section className="viewer-panel">
          {error ? <div className="status-banner error">{error}</div> : null}
          {isLoading ? <div className="status-banner loading">Loading project data...</div> : null}

          <Viewer2D
            ref={viewerRef}
            skeleton={skeleton}
            components={selectedComponents}
            categoryPositions={categoryPositions}
            categoryAngles={categoryAngles}
            selectedCategory={selectedCategory}
            isFreeMode={isFreeMode}
            headTubeAngleDeg={headTubeAngleDeg}
            paPosition={paPosition}
            pbPosition={pbPosition}
            showSkeleton={showSkeleton}
            hiddenCategories={hiddenCategories}
            aiOverlays={aiOverlays}
            selectedAiCategory={selectedAiCategory}
            onToggleSkeletonVisibility={() => setShowSkeleton((current) => !current)}
            onSelectCategory={(category: Category) => selectCategory(category)}
            onSelectAiCategory={setSelectedAiCategory}
            onClearAiSelection={() => setSelectedAiCategory(null)}
            onSetPaPosition={setPaPosition}
            onSetPbPosition={setPbPosition}
            onMoveCategory={setCategoryPosition}
            onMoveAiOverlay={handleMoveAiOverlay}
            onUpdateAiOverlay={handleUpdateAiOverlay}
            onRemoveAiOverlay={handleRemoveAiOverlay}
          />
        </section>
      </main>

      <AIImageModal
        isOpen={aiImageOpen}
        onClose={() => setAiImageOpen(false)}
        originalImage={aiCapture}
        onSendToSimilar={(result) => {
          setAiLastMarketingResult(result);
          setAiImageOpen(false);
          setAiSimilarOpen(true);
        }}
      />
      <AIBrandPartsModal
        isOpen={aiBrandOpen}
        onClose={() => setAiBrandOpen(false)}
        originalImage={aiCapture}
      />
      <AIPartReplaceModal
        isOpen={aiReplaceOpen}
        onClose={() => setAiReplaceOpen(false)}
        originalImage={aiCapture}
        selectedParts={Object.fromEntries(
          Object.entries(selectedComponentIds)
            .filter(([, id]) => id != null && componentDetails[id])
            .map(([cat, id]) => [
              cat,
              { id: id!, name: componentDetails[id!].name, category: cat },
            ]),
        )}
        selectedPartPreviews={Object.fromEntries(
          Object.entries(selectedComponentIds)
            .filter(([, id]) => id != null && componentDetails[id])
            .map(([cat, id]) => [cat, componentDetails[id!].preview_svg ?? null]),
        )}
        captureTargetMask={captureTargetMask}
        defaultCategory={selectedCategory}
        designName={vehicle}
        onApplyToCanvas={handleApplyAiOverlay}
      />
      <AISimilarImageModal
        isOpen={aiSimilarOpen}
        onClose={() => setAiSimilarOpen(false)}
        bicycleImage={aiLastMarketingResult ?? aiCapture}
      />
      <DrawingProgressModal
        isOpen={drawingOpen}
        configurationId={configurationId}
        onClose={() => setDrawingOpen(false)}
      />
      <GeminiKeyModal
        isOpen={geminiKeyOpen}
        onClose={() => setGeminiKeyOpen(false)}
      />

      <AIIntegrateModal
        isOpen={aiIntegrateOpen}
        onClose={() => setAiIntegrateOpen(false)}
        combinedCanvas={aiIntegrateCanvas}
        partNamesEn={aiIntegratePartNames}
        partNamesZh={aiIntegratePartNames}
      />
    </div>
  );
}

export default App;
