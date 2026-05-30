import type { FormEvent } from "react";
import { Sparkles } from "lucide-react";
import type { AdvisorDraft } from "@hushline/shared";

export interface AdvisorSetupPanelProps {
  advisors: AdvisorDraft[];
  isStarting: boolean;
  error: string | null;
  onBack: () => void;
  onRegenerate: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AdvisorSetupPanel({
  advisors,
  isStarting,
  error,
  onBack,
  onRegenerate,
  onSubmit,
}: AdvisorSetupPanelProps) {
  return (
    <section className="advisor-panel" aria-label="조언자 생성">
      <div className="persona-copy">
        <Sparkles size={18} />
        <span>익명 조언자 생성</span>
      </div>
      <div className="advisor-list">
        {advisors.map((advisor) => (
          <article key={advisor.id} className="advisor-card">
            <strong>{advisor.anonymousLabel}</strong>
            <p>{advisor.role}</p>
            <span>{advisor.mbti}</span>
          </article>
        ))}
      </div>
      {error ? <p className="error-line setup-error">{error}</p> : null}
      <div className="advisor-actions">
        <button type="button" onClick={onBack}>
          이전
        </button>
        <button type="button" onClick={onRegenerate}>
          다시 구성
        </button>
        <form onSubmit={onSubmit}>
          <button type="submit" disabled={isStarting}>
            {isStarting ? "연결 중" : "초대 확인"}
          </button>
        </form>
      </div>
    </section>
  );
}
