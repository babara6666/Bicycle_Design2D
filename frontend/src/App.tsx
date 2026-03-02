import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AIBrandPartsModal from "./components/AIBrandPartsModal";
import AIImageModal from "./components/AIImageModal";
import AIPartReplaceModal from "./components/AIPartReplaceModal";
import AISimilarImageModal from "./components/AISimilarImageModal";
import DrawingProgressModal from "./components/DrawingProgressModal";
import GeminiKeyModal from "./components/GeminiKeyModal";
import { ComponentPanel } from "./components/ComponentPanel";
import { GeometryPanel } from "./components/GeometryPanel";
import { HeaderBar } from "./components/HeaderBar";
import { LoginPage } from "./components/LoginPage";
import { Viewer2D } from "./components/Viewer2D";
import { REQUIRED_NODES } from "./constants";
import { useAuthStore } from "./stores/authStore";
import { useEditorStore } from "./stores/editorStore";
import type { Category, ComponentDetail } from "./types";
import { captureSvgToPng } from "./utils/capture";
import "./App.css";

function App() {
  // AUTH DISABLED — skip login
  return <AuthenticatedApp username="dev" role="admin" onLogout={() => {}} />;
}

interface AuthenticatedAppProps {
  username: string;
  role: string;
  onLogout: () => void;
}

function AuthenticatedApp({ username, role, onLogout }: AuthenticatedAppProps) {
  // AI modal state
  const viewerSvgRef = useRef<SVGSVGElement>(null);
  const [aiCapture, setAiCapture] = useState<string | null>(null);
  const [aiLastMarketingResult, setAiLastMarketingResult] = useState<string | null>(null);
  const [aiImageOpen, setAiImageOpen] = useState(false);
  const [aiBrandOpen, setAiBrandOpen] = useState(false);
  const [aiReplaceOpen, setAiReplaceOpen] = useState(false);
  const [aiSimilarOpen, setAiSimilarOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [geminiKeyOpen, setGeminiKeyOpen] = useState(false);

  const captureViewer = useCallback(async (): Promise<string | null> => {
    if (!viewerSvgRef.current) return null;
    try {
      const png = await captureSvgToPng(viewerSvgRef.current);
      setAiCapture(png);
      return png;
    } catch {
      return null;
    }
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

  const openAISimilar = useCallback(() => {
    setAiSimilarOpen(true);
  }, []);

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

  useEffect(() => {
    void initialize();
  }, [initialize]);

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
        onOpenAISimilar={openAISimilar}
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
            onSelectCategory={selectCategory}
            onSelectComponent={(category, id) => void selectComponent(category, id)}
            onSetCategoryAngle={setCategoryAngle}
            onNudgeCategory={nudgeCategory}
            onResetCategory={resetCategoryToDefault}
          />
        </aside>

        <section className="viewer-panel">
          {error ? <div className="status-banner error">{error}</div> : null}
          {isLoading ? <div className="status-banner loading">Loading project data...</div> : null}

          <Viewer2D
            ref={viewerSvgRef}
            skeleton={skeleton}
            components={selectedComponents}
            categoryPositions={categoryPositions}
            categoryAngles={categoryAngles}
            selectedCategory={selectedCategory}
            isFreeMode={isFreeMode}
            headTubeAngleDeg={headTubeAngleDeg}
            paPosition={paPosition}
            pbPosition={pbPosition}
            onSelectCategory={(category: Category) => selectCategory(category)}
            onSetPaPosition={setPaPosition}
            onSetPbPosition={setPbPosition}
            onMoveCategory={setCategoryPosition}
          />
        </section>
      </main>

      {/* AI Modals */}
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
        designName={vehicle}
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
    </div>
  );
}

export default App;
