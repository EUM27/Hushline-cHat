import type { FormEvent } from "react";
import { Sparkles } from "lucide-react";
import type { PersonaDraft } from "../../types/ui";

export interface PersonaSetupPanelProps {
  personaDraft: PersonaDraft;
  personaPrompt: string;
  relationshipTagText: string;
  hasScenarioAdvisors: boolean;
  isStarting: boolean;
  isGeneratingPersona: boolean;
  error: string | null;
  personaGenerationError: string | null;
  onDraftChange: (patch: Partial<PersonaDraft>) => void;
  onPersonaPromptChange: (value: string) => void;
  onRelationshipTagTextChange: (value: string) => void;
  onGeneratePersona: () => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function PersonaSetupPanel({
  personaDraft,
  personaPrompt,
  relationshipTagText,
  hasScenarioAdvisors,
  isStarting,
  isGeneratingPersona,
  error,
  personaGenerationError,
  onDraftChange,
  onPersonaPromptChange,
  onRelationshipTagTextChange,
  onGeneratePersona,
  onBack,
  onSubmit,
}: PersonaSetupPanelProps) {
  const displayName = personaDraft.name.trim() || "{{유저}}";
  const role = personaDraft.role.trim() || "장면 속 인물";
  const description = personaDraft.description.trim() || "시작 전 정체성을 정하면 장면 안 반응이 더 구체화됩니다.";

  return (
    <section className="persona-panel" aria-label="페르소나 설정">
      <div className="persona-copy">
        <Sparkles size={18} />
        <span>페르소나 설정</span>
      </div>
      <div className="advisor-list">
        <article className="advisor-card">
          <strong>{displayName}</strong>
          <p>{description}</p>
          <span>{role}</span>
        </article>
      </div>
      <form onSubmit={onSubmit}>
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
        <div className="advisor-actions" style={{ gridTemplateColumns: "auto 1fr" }}>
          <button type="button" onClick={onBack}>
            이전
          </button>
          <button type="submit" disabled={isStarting}>
            {hasScenarioAdvisors
              ? isStarting
                ? "초대 중..."
                : "초대 확인"
              : "다음"}
          </button>
        </div>
      </form>
    </section>
  );
}
