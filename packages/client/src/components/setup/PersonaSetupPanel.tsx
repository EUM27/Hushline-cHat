import type { FormEvent } from "react";
import { Sparkles } from "lucide-react";

export interface PersonaSetupPanelProps {
  personaName: string;
  hasScenarioAdvisors: boolean;
  isStarting: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function PersonaSetupPanel({
  personaName,
  hasScenarioAdvisors,
  isStarting,
  error,
  onNameChange,
  onBack,
  onSubmit,
}: PersonaSetupPanelProps) {
  return (
    <section className="persona-panel" aria-label="유저 설정">
      <div className="persona-copy">
        <Sparkles size={18} />
        <span>유저 기본 설정</span>
      </div>
      <div className="advisor-list">
        <article className="advisor-card">
          <strong>{personaName || "{{유저}}"}</strong>
          <p>사건의 중심에 선 주인공. 선택과 대화로 상황의 흐름을 결정합니다.</p>
          <span>플레이어</span>
        </article>
      </div>
      <form onSubmit={onSubmit}>
        <label>
          표시 이름
          <input
            value={personaName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="{{유저}}"
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
