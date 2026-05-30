import { Sparkles } from "lucide-react";
import type { V2ScenarioDetailResponse } from "../../api-v2";

export interface ScenarioSetupPanelProps {
  scenarioList: string[];
  isScenarioListLoading: boolean;
  scenarioListError: string | null;
  selectedScenario: string;
  selectedScenarioDetail: V2ScenarioDetailResponse | null;
  error: string | null;
  onSelectScenario: (scenarioId: string) => void;
  onNext: () => void;
}

export function ScenarioSetupPanel({
  scenarioList,
  isScenarioListLoading,
  scenarioListError,
  selectedScenario,
  selectedScenarioDetail,
  error,
  onSelectScenario,
  onNext,
}: ScenarioSetupPanelProps) {
  return (
    <section className="persona-panel" aria-label="시나리오 선택">
      <div className="persona-copy">
        <Sparkles size={18} />
        <span>시나리오 선택</span>
      </div>
      <div className="scenario-list">
        {isScenarioListLoading ? (
          <p className="scenario-empty">시나리오 팩을 불러오는 중...</p>
        ) : scenarioListError ? (
          <p className="error-line setup-error">{scenarioListError}</p>
        ) : scenarioList.length === 0 ? (
          <p className="scenario-empty">사용 가능한 시나리오 팩이 없습니다.</p>
        ) : (
          <select
            className="scenario-dropdown"
            value={selectedScenario}
            onChange={(event) => {
              onSelectScenario(event.target.value);
            }}
          >
            <option value="" disabled>시나리오를 선택하세요</option>
            {scenarioList.map((packId) => (
              <option key={packId} value={packId}>
                {packId.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        )}
      </div>
      {selectedScenarioDetail && (
        <div className="scenario-detail-box">
          <div className="scenario-detail-header">
            <div className="scenario-detail-meta">
              <span className="scenario-badge genre-badge">{selectedScenarioDetail.manifest.genre}</span>
              <span className="scenario-badge version-badge">v{selectedScenarioDetail.manifest.version}</span>
            </div>
            <h2 className="scenario-detail-title">
              {selectedScenarioDetail.scenarioCard.title || selectedScenarioDetail.manifest.title}
            </h2>
            <p className="scenario-detail-subtitle">
              {selectedScenarioDetail.scenarioCard.subtitle || selectedScenarioDetail.manifest.subtitle}
            </p>
          </div>
          <div className="scenario-detail-body">
            <div className="scenario-section">
              <h3>시나리오 개요</h3>
              <p className="scenario-description">{selectedScenarioDetail.scenarioCard.description}</p>
            </div>
            <div className="scenario-section">
              <h3>핵심 목표</h3>
              <p className="scenario-objective">🎯 {selectedScenarioDetail.mainObjective.description}</p>
            </div>
            <div className="scenario-section">
              <h3>등장 인물 ({selectedScenarioDetail.characters.length}명)</h3>
              <div className="scenario-characters-preview">
                {selectedScenarioDetail.characters.map((char) => (
                  <div key={char.id} className="scenario-char-preview-badge">
                    <strong>{char.name}</strong>
                    <span>{char.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {error ? <p className="error-line setup-error">{error}</p> : null}
      <button
        type="button"
        disabled={!selectedScenario || !selectedScenarioDetail}
        onClick={onNext}
      >
        {selectedScenario && !selectedScenarioDetail ? "불러오는 중..." : "다음"}
      </button>
    </section>
  );
}
