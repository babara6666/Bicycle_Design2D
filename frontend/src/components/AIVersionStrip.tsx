import { useEffect, useRef } from "react";

export interface AIVersion {
  id: number;
  image: string; // data:image/png;base64,…
  prompt: string;
  text?: string;
  timestamp: Date;
}

interface AIVersionStripProps {
  versions: AIVersion[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDelete?: (id: number) => void;
  onClearAll?: () => void;
}

export default function AIVersionStrip({
  versions,
  selectedId,
  onSelect,
  onDelete,
  onClearAll,
}: AIVersionStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.scrollLeft = stripRef.current.scrollWidth;
    }
  }, [versions.length]);

  if (versions.length === 0) return null;

  const handleDownload = (v: AIVersion) => {
    const a = document.createElement("a");
    a.href = v.image;
    // eslint-disable-next-line react-hooks/purity
    a.download = `bicycle2d_ai_v${v.id}_${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="ai-version-strip">
      <div className="ai-version-strip-header">
        <span className="ai-version-strip-label">版本歷史 ({versions.length})</span>
        {onClearAll && versions.length > 0 && (
          <button className="ai-version-strip-clear" onClick={onClearAll} type="button">
            清除全部
          </button>
        )}
      </div>
      <div className="ai-version-list" ref={stripRef}>
        {versions.map((v) => {
          const isSelected = v.id === selectedId;
          return (
            <div
              key={v.id}
              className={`ai-version-thumb${isSelected ? " selected" : ""}`}
              onClick={() => onSelect(v.id)}
            >
              <img src={v.image} alt={`Version ${v.id}`} />
              <div className="ai-version-badge">v{v.id}</div>
              {onDelete && (
                <button
                  className="ai-version-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(v.id);
                  }}
                  type="button"
                  title="刪除"
                >
                  ✕
                </button>
              )}
              <button
                className="ai-version-dl"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(v);
                }}
                type="button"
                title="下載"
              >
                ↓
              </button>
              <div className="ai-version-time">
                {v.timestamp.toLocaleTimeString("zh-TW", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
