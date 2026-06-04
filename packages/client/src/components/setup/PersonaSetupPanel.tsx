import { type ChangeEvent, type FormEvent, useState } from "react";
import { ImagePlus, Sparkles } from "lucide-react";
import type { PersonaLibraryEntry, ReusablePersonaProfile } from "../../api-v2";
import type { PersonaDraft } from "../../types/ui";

export interface PersonaSetupPanelProps {
  personaDraft: PersonaDraft;
  personaPrompt: string;
  relationshipTagText: string;
  savedPersonaProfiles: PersonaLibraryEntry[];
  isStarting: boolean;
  isGeneratingPersona: boolean;
  isSavingPersona: boolean;
  error: string | null;
  personaGenerationError: string | null;
  libraryStatus: string | null;
  onDraftChange: (patch: Partial<PersonaDraft>) => void;
  onPersonaPromptChange: (value: string) => void;
  onRelationshipTagTextChange: (value: string) => void;
  onGeneratePersona: () => void;
  onSavePersona: () => void;
  onApplyPersonaProfile: (profile: ReusablePersonaProfile) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function PersonaSetupPanel({
  personaDraft,
  personaPrompt,
  relationshipTagText,
  savedPersonaProfiles,
  isStarting,
  isGeneratingPersona,
  isSavingPersona,
  error,
  personaGenerationError,
  libraryStatus,
  onDraftChange,
  onPersonaPromptChange,
  onRelationshipTagTextChange,
  onGeneratePersona,
  onSavePersona,
  onApplyPersonaProfile,
  onBack,
  onSubmit,
}: PersonaSetupPanelProps) {
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const displayName = personaDraft.name.trim() || "{{유저}}";
  const role = personaDraft.role.trim() || "장면 속 인물";
  const description = personaDraft.description.trim() || "시작 전 정체성을 정하면 장면 안 반응이 더 구체화됩니다.";
  const portraitUrl = personaDraft.portraitUrl?.trim();
  const previewClassName = `persona-preview-card${portraitUrl ? " has-portrait" : ""}`;

  function handlePortraitFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    onDraftChange({ portraitUrl: URL.createObjectURL(file) });
    event.target.value = "";
  }

  function handleSavedProfileChange(value: string) {
    setSelectedProfileId(value);
    const selected = savedPersonaProfiles.find((profile) => profile.id === value);
    if (selected) {
      onApplyPersonaProfile(selected.persona);
      setSelectedProfileId("");
    }
  }

  return (
    <section className="persona-panel setup-flow-panel persona-flow-panel" aria-label="페르소나 설정">
      <header className="setup-flow-header">
        <span className="setup-step-index">02</span>
        <div>
          <p className="setup-kicker">
            <Sparkles size={16} aria-hidden="true" />
            Persona
          </p>
          <h2>장면 안의 당신을 정하세요</h2>
          <p>이름, 입장, 공개 설명만 정해도 바로 시작할 수 있습니다.</p>
        </div>
      </header>

      <div className="setup-flow-body persona-flow-grid">
        <aside className={previewClassName} aria-label="페르소나 이미지">
          <label className="persona-portrait-drop">
            <input type="file" accept="image/*" onChange={handlePortraitFileChange} />
            {portraitUrl ? (
              <img src={portraitUrl} alt={`${displayName} 이미지`} />
            ) : (
              <span className="persona-portrait-placeholder">
                <strong>{displayName}</strong>
                <ImagePlus size={22} aria-hidden="true" />
                <em>이미지 선택</em>
              </span>
            )}
          </label>
          <div className="persona-preview-content">
            <span className="persona-preview-label">Persona</span>
            <p>{description}</p>
            <span className="persona-role-pill">{role}</span>
            <label className="persona-portrait-url">
              <span>Image URL</span>
              <input
                value={personaDraft.portraitUrl ?? ""}
                onChange={(event) => onDraftChange({ portraitUrl: event.target.value })}
                placeholder="https://..."
              />
            </label>
          </div>
        </aside>

        <form className="persona-form-panel" onSubmit={onSubmit}>
          <div className="persona-maker-box">
            <label>
              페르소나 생성 프롬프트
              <textarea
                value={personaPrompt}
                onChange={(event) => onPersonaPromptChange(event.target.value)}
                placeholder="예: 비 오는 밤 공유주택에 도착한 새 입주자"
                rows={2}
              />
            </label>
            <button
              type="button"
              className="persona-secondary-button"
              onClick={onGeneratePersona}
              disabled={isGeneratingPersona || !personaPrompt.trim()}
            >
              {isGeneratingPersona ? "생성 중..." : "초안 생성"}
            </button>
            {personaGenerationError ? <p className="error-line setup-error">{personaGenerationError}</p> : null}
          </div>
          <div className="persona-library-box">
            <label>
              저장된 페르소나
              <select
                value={selectedProfileId}
                onChange={(event) => handleSavedProfileChange(event.target.value)}
                disabled={savedPersonaProfiles.length === 0}
              >
                <option value="">
                  {savedPersonaProfiles.length === 0 ? "저장된 페르소나 없음" : "불러올 페르소나 선택"}
                </option>
                {savedPersonaProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="persona-secondary-button"
              onClick={onSavePersona}
              disabled={isSavingPersona || !personaDraft.name.trim()}
            >
              {isSavingPersona ? "저장 중..." : "현재 페르소나 저장"}
            </button>
            {libraryStatus ? <p className="persona-library-status">{libraryStatus}</p> : null}
          </div>
          <div className="persona-field-grid">
            <label>
              표시 이름
              <input
                value={personaDraft.name}
                onChange={(event) => onDraftChange({ name: event.target.value })}
                placeholder="{{유저}}"
              />
            </label>
            <label>
              짧은 호칭
              <input
                value={personaDraft.shortName}
                onChange={(event) => onDraftChange({ shortName: event.target.value })}
                placeholder="해윤"
              />
            </label>
          </div>
          <label>
            장면 내 입장
            <input
              value={personaDraft.role}
              onChange={(event) => onDraftChange({ role: event.target.value })}
              placeholder="공유주택에 막 들어온 새 입주자"
            />
          </label>
          <label>
            공개 설명
            <textarea
              value={personaDraft.description}
              onChange={(event) => onDraftChange({ description: event.target.value })}
              placeholder="다른 인물이 알아도 되는 배경이나 분위기"
              rows={3}
            />
          </label>
          <label>
            외형
            <textarea
              value={personaDraft.appearance}
              onChange={(event) => onDraftChange({ appearance: event.target.value })}
              placeholder="관찰 가능한 옷차림, 표정, 몸가짐"
              rows={3}
            />
          </label>
          <label>
            관계 태그
            <input
              value={relationshipTagText}
              onChange={(event) => onRelationshipTagTextChange(event.target.value)}
              placeholder="new-tenant, keeps-distance"
            />
          </label>
          {error ? <p className="error-line setup-error">{error}</p> : null}
          <footer className="setup-flow-actions two-up">
            <button type="button" onClick={onBack}>
              이전
            </button>
            <button type="submit" disabled={isStarting}>
              {isStarting ? "시작 중..." : "시작하기"}
            </button>
          </footer>
        </form>
      </div>
    </section>
  );
}
