import { type ChangeEvent, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  importCharacterCard,
  type CharacterCardLibraryEntry,
  type ImportedCharacterCard,
  type V2ScenarioDetailResponse,
} from "../../api-v2";
import { beginCharacterCardImport } from "./character-card-target";

export interface ScenarioSetupPanelProps {
  scenarioList: string[];
  isScenarioListLoading: boolean;
  scenarioListError: string | null;
  selectedScenario: string;
  selectedScenarioDetail: V2ScenarioDetailResponse | null;
  characterOverrides: Record<string, ImportedCharacterCard>;
  characterLibrary: CharacterCardLibraryEntry[];
  error: string | null;
  onSelectScenario: (scenarioId: string) => void;
  onCharacterOverride: (targetId: string, character: ImportedCharacterCard) => void;
  onCharacterOverrideClear: (targetId: string) => void;
  onNext: () => void;
}

export function ScenarioSetupPanel({
  scenarioList,
  isScenarioListLoading,
  scenarioListError,
  selectedScenario,
  selectedScenarioDetail,
  characterOverrides,
  characterLibrary,
  error,
  onSelectScenario,
  onCharacterOverride,
  onCharacterOverrideClear,
  onNext,
}: ScenarioSetupPanelProps) {
  const cardInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCharacterIdRef = useRef<string | null>(null);
  const [importingCharacterId, setImportingCharacterId] = useState<string | null>(null);
  const [characterImportError, setCharacterImportError] = useState<string | null>(null);
  const [characterImportStatus, setCharacterImportStatus] = useState<string | null>(null);
  const [libraryTargetId, setLibraryTargetId] = useState("");
  const [libraryCardId, setLibraryCardId] = useState("");
  const appliedOverrideCount = Object.keys(characterOverrides).length;
  const displayedImportStatus =
    characterImportStatus ?? (appliedOverrideCount > 0 ? `외부 캐릭터 카드 ${appliedOverrideCount}개 적용됨` : null);

  function handleScenarioSelect(packId: string) {
    setCharacterImportError(null);
    setCharacterImportStatus(null);
    onSelectScenario(packId);
  }

  function handleCharacterClick(characterId: string) {
    setCharacterImportError(null);
    setCharacterImportStatus(null);
    beginCharacterCardImport(pendingCharacterIdRef, characterId, () => cardInputRef.current?.click());
  }

  async function handleCharacterFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const targetId = pendingCharacterIdRef.current;
    event.target.value = "";
    if (!file || !targetId) return;

    setImportingCharacterId(targetId);
    setCharacterImportError(null);
    try {
      const imported = await importCharacterCard(file);
      onCharacterOverride(targetId, imported.character);
      setCharacterImportStatus(
        `${imported.character.name} 카드를 ${formatTargetLabel(selectedScenarioDetail, targetId)} 슬롯에 적용했습니다.`,
      );
    } catch (reason) {
      setCharacterImportError(reason instanceof Error ? reason.message : "캐릭터 카드를 불러오지 못했습니다.");
      setCharacterImportStatus(null);
    } finally {
      setImportingCharacterId(null);
      pendingCharacterIdRef.current = null;
    }
  }

  function handleApplyLibraryCard() {
    const targetId = libraryTargetId;
    const selected = characterLibrary.find((entry) => entry.id === libraryCardId);
    if (!targetId || !selected) return;

    onCharacterOverride(targetId, selected.character);
    setCharacterImportStatus(
      `${selected.name} 카드를 ${formatTargetLabel(selectedScenarioDetail, targetId)} 슬롯에 적용했습니다.`,
    );
    setLibraryCardId("");
  }

  function handleClearCharacterOverride(targetId: string) {
    onCharacterOverrideClear(targetId);
    setCharacterImportStatus(`${formatTargetLabel(selectedScenarioDetail, targetId)} 슬롯을 기본 인물로 되돌렸습니다.`);
  }

  return (
    <section className="persona-panel setup-flow-panel scenario-flow-panel" aria-label="시나리오 선택">
      <header className="setup-flow-header">
        <span className="setup-step-index">01</span>
        <div>
          <p className="setup-kicker">
            <Sparkles size={16} aria-hidden="true" />
            시나리오 선택
          </p>
        </div>
      </header>

      <div className="setup-flow-body scenario-flow-grid">
        <div className="scenario-choice-list" aria-label="시나리오 팩">
          {isScenarioListLoading ? (
            <p className="scenario-empty">시나리오 팩을 불러오는 중...</p>
          ) : scenarioListError ? (
            <p className="error-line setup-error">{scenarioListError}</p>
          ) : scenarioList.length === 0 ? (
            <p className="scenario-empty">사용 가능한 시나리오 팩이 없습니다.</p>
          ) : (
            scenarioList.map((packId, index) => (
              <button
                key={packId}
                type="button"
                className={`scenario-choice-card ${selectedScenario === packId ? "selected" : ""}`}
                onClick={() => handleScenarioSelect(packId)}
              >
                <span className="scenario-choice-no">{String(index + 1).padStart(2, "0")}</span>
                <strong>{formatScenarioLabel(packId)}</strong>
                <span>{selectedScenario === packId && !selectedScenarioDetail ? "불러오는 중..." : "시나리오 팩"}</span>
              </button>
            ))
          )}
        </div>

        <aside className="scenario-preview-panel" aria-label="선택한 시나리오 정보">
          {selectedScenarioDetail ? (
            <>
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
              <p className="scenario-description">{selectedScenarioDetail.scenarioCard.description}</p>
              <div className="scenario-objective-box">
                <span>핵심 목표</span>
                <p>{selectedScenarioDetail.mainObjective.description}</p>
              </div>
              <div className="scenario-characters-preview">
                {selectedScenarioDetail.characters.map((char) => {
                  const override = characterOverrides[char.id];
                  const displayName = override?.name ?? char.name;
                  const displayRole = override?.role ?? char.role;
                  const isImporting = importingCharacterId === char.id;
                  return (
                    <article
                      key={char.id}
                      className={`scenario-cast-slot${override ? " is-overridden" : ""}`}
                    >
                      <div className="scenario-cast-slot-head">
                        <div>
                          <strong>{displayName}</strong>
                          <span>{displayRole}</span>
                        </div>
                        <em>{override ? "외부 카드 적용됨" : "기본 인물"}</em>
                      </div>
                      <div className="scenario-cast-slot-actions">
                        <button type="button" onClick={() => handleCharacterClick(char.id)} disabled={isImporting}>
                          {isImporting ? "불러오는 중..." : "카드 가져오기"}
                        </button>
                        {override ? (
                          <button type="button" onClick={() => handleClearCharacterOverride(char.id)}>
                            기본값으로 되돌리기
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              <section className="character-library-browser" aria-label="저장된 캐릭터 카드">
                <header>
                  <strong>저장된 카드 {characterLibrary.length}개</strong>
                  <span>다음 세션에서도 다시 쓸 수 있습니다.</span>
                </header>
                {characterLibrary.length === 0 ? (
                  <p className="character-library-empty">
                    PNG/JSON 캐릭터 카드를 가져오면 여기에 저장됩니다. 다음 세션에서도 다시 쓸 수 있습니다.
                  </p>
                ) : (
                  <div className="character-library-list">
                    {characterLibrary.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={`character-library-card${libraryCardId === entry.id ? " selected" : ""}`}
                        onClick={() => setLibraryCardId(entry.id)}
                      >
                        <strong>{entry.name}</strong>
                        <span>{entry.sourceFileName ?? "저장된 카드"}</span>
                        <em>{formatLibrarySource(entry)}</em>
                      </button>
                    ))}
                  </div>
                )}
                <div className="character-library-apply">
                  <select
                    value={libraryTargetId}
                    onChange={(event) => setLibraryTargetId(event.target.value)}
                    aria-label="교체할 시나리오 인물"
                    disabled={characterLibrary.length === 0}
                  >
                    <option value="">적용할 인물 선택</option>
                    {selectedScenarioDetail.characters.map((char) => (
                      <option key={char.id} value={char.id}>
                        {char.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="persona-secondary-button"
                    onClick={handleApplyLibraryCard}
                    disabled={!libraryTargetId || !libraryCardId}
                  >
                    저장된 카드 적용
                  </button>
                </div>
              </section>
              <input
                ref={cardInputRef}
                type="file"
                accept=".json,.png,image/png,application/json"
                hidden
                onChange={(event) => void handleCharacterFileChange(event)}
              />
              {displayedImportStatus ? (
                <p className="character-import-status" role="status" aria-live="polite">
                  {displayedImportStatus}
                </p>
              ) : null}
              {characterImportError ? <p className="error-line setup-error">{characterImportError}</p> : null}
            </>
          ) : (
            <div className="scenario-preview-empty">
              <span>선택 대기</span>
              <p>왼쪽에서 시나리오를 고르면 개요와 목표가 여기에 펼쳐집니다.</p>
            </div>
          )}
        </aside>
      </div>
      {error ? <p className="error-line setup-error">{error}</p> : null}
      <footer className="setup-flow-actions">
        <button
          type="button"
          disabled={!selectedScenario || !selectedScenarioDetail}
          onClick={onNext}
        >
          {selectedScenario && !selectedScenarioDetail ? "불러오는 중..." : "역할 정하기"}
        </button>
      </footer>
    </section>
  );
}

function formatScenarioLabel(packId: string): string {
  return packId
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLibrarySource(entry: CharacterCardLibraryEntry): string {
  const creator = entry.sourceMetadata?.creator;
  const source = entry.sourceMetadata?.sourceFormat ?? "saved";
  return creator ? `${creator} · ${source}` : source;
}

function formatTargetLabel(detail: V2ScenarioDetailResponse | null, targetId: string): string {
  return detail?.characters.find((character) => character.id === targetId)?.name ?? targetId;
}
