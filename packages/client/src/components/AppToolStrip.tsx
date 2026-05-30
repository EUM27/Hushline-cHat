import { Settings, Wrench } from "lucide-react";

export interface AppToolStripProps {
  placement: "inline" | "floating";
  isConnectionPanelOpen: boolean;
  isDevPanelOpen: boolean;
  showDevTools: boolean;
  onToggleConnectionPanel: () => void;
  onToggleDevPanel: () => void;
}

export function AppToolStrip({
  placement,
  isConnectionPanelOpen,
  isDevPanelOpen,
  showDevTools,
  onToggleConnectionPanel,
  onToggleDevPanel,
}: AppToolStripProps) {
  return (
    <div
      className={`app-tool-strip ${placement} ${isConnectionPanelOpen || isDevPanelOpen ? "overlay-open" : ""}`}
      aria-label="앱 도구"
    >
      <button
        type="button"
        className={`app-tool-toggle ${isConnectionPanelOpen ? "active" : ""}`}
        aria-label={isConnectionPanelOpen ? "모델 설정 닫기" : "모델 설정 열기"}
        aria-expanded={isConnectionPanelOpen}
        onClick={onToggleConnectionPanel}
        title="모델 설정"
      >
        <Settings size={18} aria-hidden="true" />
      </button>

      {showDevTools ? (
        <button
          type="button"
          className={`app-tool-toggle ${isDevPanelOpen ? "active" : ""}`}
          aria-label={isDevPanelOpen ? "개발자 패널 닫기" : "개발자 패널 열기"}
          aria-expanded={isDevPanelOpen}
          onClick={onToggleDevPanel}
          title="개발자 패널"
        >
          <Wrench size={18} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
