import { useCallback, useEffect, useRef, useState } from "react";

import { authedFetch } from "../utils/authedFetch";

interface JobStatus {
  job_id: number;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  current_step: string | null;
  dxf_path: string | null;
  dwg_path: string | null;
  pdf_path: string | null;
  error_message: string | null;
}

interface DrawingProgressModalProps {
  isOpen: boolean;
  configurationId: number | null;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 1500;

export default function DrawingProgressModal({
  isOpen,
  configurationId,
  onClose,
}: DrawingProgressModalProps) {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async (jobId: number) => {
    try {
      const res = await authedFetch(`/api/export/status/${jobId}`);
      if (!res.ok) return;
      const data: JobStatus = await res.json();
      setJobStatus(data);
      if (data.status === "completed" || data.status === "failed") {
        stopPolling();
      }
    } catch {
      // ignore transient network errors
    }
  }, [stopPolling]);

  const startJob = useCallback(async () => {
    if (configurationId == null) return;
    setIsStarting(true);
    setStartError(null);
    setJobStatus(null);
    stopPolling();
    try {
      const res = await authedFetch("/api/export/dwg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configuration_id: configurationId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        setStartError(err.detail ?? "Failed to start export");
        return;
      }
      const data: JobStatus = await res.json();
      setJobStatus(data);
      // start polling
      pollTimerRef.current = setInterval(() => void pollStatus(data.job_id), POLL_INTERVAL_MS);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsStarting(false);
    }
  }, [configurationId, pollStatus, stopPolling]);

  // Clean up polling when modal closes
  useEffect(() => {
    if (!isOpen) {
      stopPolling();
    }
  }, [isOpen, stopPolling]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  if (!isOpen) return null;

  const isCompleted = jobStatus?.status === "completed";
  const isFailed = jobStatus?.status === "failed";
  const isRunning =
    jobStatus?.status === "pending" || jobStatus?.status === "processing";

  const progressPct = jobStatus?.progress ?? 0;

  const handleDownload = async (type: "dxf" | "dwg" | "pdf") => {
    if (!jobStatus) return;
    const url = `/api/export/download/${jobStatus.job_id}/${type}`;
    const res = await authedFetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = `bicycle2d_job${jobStatus.job_id}.${type}`;
    a.click();
    URL.revokeObjectURL(objUrl);
  };

  return (
    <div className="ai-overlay" onClick={onClose} role="presentation">
      <div
        className="ai-modal drawing-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="出圖進度"
      >
        <div className="ai-modal-header">
          <span className="ai-modal-title">出圖 / 匯出</span>
          <button className="ai-modal-close" onClick={onClose} type="button" aria-label="關閉">
            ×
          </button>
        </div>

        <div className="ai-modal-body drawing-modal-body">
          {/* Config info */}
          <div className="drawing-info-row">
            <span className="drawing-label">設定 ID</span>
            <span className="drawing-value">
              {configurationId != null ? `#${configurationId}` : "—（請先儲存設定）"}
            </span>
          </div>

          {/* Start button */}
          {!isRunning && !isCompleted && (
            <button
              className="ai-btn primary drawing-start-btn"
              onClick={() => void startJob()}
              disabled={isStarting || configurationId == null}
              type="button"
            >
              {isStarting ? "啟動中…" : "開始出圖"}
            </button>
          )}

          {startError && (
            <div className="ai-error-box">{startError}</div>
          )}

          {/* Progress bar */}
          {jobStatus && (
            <div className="drawing-progress-section">
              <div className="drawing-progress-bar-wrap">
                <div
                  className={`drawing-progress-bar ${isFailed ? "failed" : isCompleted ? "done" : "running"}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="drawing-progress-label">
                {isFailed
                  ? `失敗：${jobStatus.error_message ?? "未知錯誤"}`
                  : `${progressPct}% — ${jobStatus.current_step ?? ""}`}
              </div>
            </div>
          )}

          {/* Download buttons — shown when completed */}
          {isCompleted && (
            <div className="drawing-download-row">
              <button
                className="ai-btn secondary drawing-dl-btn"
                onClick={() => void handleDownload("dxf")}
                type="button"
              >
                ⬇ DXF
              </button>
              {jobStatus?.dwg_path ? (
                <button
                  className="ai-btn primary drawing-dl-btn"
                  onClick={() => void handleDownload("dwg")}
                  type="button"
                >
                  ⬇ DWG
                </button>
              ) : (
                <span className="drawing-dl-unavailable" title="需安裝 ODA File Converter">
                  DWG（未安裝 ODA）
                </span>
              )}
              {jobStatus?.pdf_path ? (
                <button
                  className="ai-btn secondary drawing-dl-btn"
                  onClick={() => void handleDownload("pdf")}
                  type="button"
                >
                  ⬇ PDF
                </button>
              ) : (
                <span className="drawing-dl-unavailable" title="需安裝 LibreOffice">
                  PDF（未安裝 LibreOffice）
                </span>
              )}
            </div>
          )}

          {/* Re-run button after completion/failure */}
          {(isCompleted || isFailed) && (
            <button
              className="ai-btn ghost drawing-rerun-btn"
              onClick={() => void startJob()}
              disabled={isStarting}
              type="button"
            >
              重新出圖
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
