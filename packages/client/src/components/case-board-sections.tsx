// ──────────────────────────────────────────────
// Shared case-board section renderers (clues + dossiers)
// ──────────────────────────────────────────────
// Used by both the right-side CaseBoardPanel (legacy/large) and the
// in-phone PhoneCaseFile app, so display logic lives in one place.
// ──────────────────────────────────────────────

import type { CaseBoardView } from "@hushline/shared";

export const clueSourceLabel: Record<string, string> = {
  briefing: "사건 개요",
  public: "공개 정보",
  observed: "현장 관찰",
  testimony: "증언",
};

export const statementStatusLabel: Record<string, string> = {
  unverified: "미확인",
  supported: "뒷받침됨",
  contradicted: "모순",
  partially_true: "부분적 사실",
};

export const verdictLabel: Record<string, string> = {
  not_a_deduction: "추리 아님",
  insufficient: "근거 부족",
  partially_correct: "부분 정답",
  correct: "정답",
  wrong_conclusion: "잘못된 결론",
  overreached: "비약",
};

export const openQuestionLabel: Record<string, string> = {
  noticed: "포착됨",
  contested: "쟁점화",
  nearly_resolved: "거의 해결",
  resolved: "해결됨",
};

export function CaseClues({ caseBoard }: { caseBoard: CaseBoardView }) {
  if (!caseBoard.isCaseScenario) {
    return <p className="case-board-empty">이 이야기에는 추리 단서가 없어.</p>;
  }

  return (
    <>
      <section className="case-board-section">
        <h4>밝혀진 단서</h4>
        {caseBoard.clues.length === 0 ? (
          <p className="case-board-muted">아직 확보한 단서가 없어.</p>
        ) : (
          <ul className="case-clue-list">
            {caseBoard.clues.map((clue) => (
              <li key={clue.id} className="case-clue">
                <span className={`case-clue-source ${clue.source}`}>
                  {clueSourceLabel[clue.source] ?? clue.source}
                </span>
                <p>{clue.text}</p>
                {clue.knownSinceTurn > 0 ? (
                  <span className="case-clue-turn">T{clue.knownSinceTurn}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {caseBoard.statements.length > 0 ? (
        <section className="case-board-section">
          <h4>진술 기록</h4>
          <ul className="case-statement-list">
            {caseBoard.statements.map((statement) => (
              <li key={statement.id} className="case-statement">
                <div className="case-statement-head">
                  <strong>{statement.speakerLabel}</strong>
                  <span className={`case-statement-status ${statement.status}`}>
                    {statementStatusLabel[statement.status] ?? statement.status}
                  </span>
                  <span className="case-statement-turn">T{statement.turn}</span>
                </div>
                <p>{statement.content}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {caseBoard.contradictions.length > 0 ? (
        <section className="case-board-section">
          <h4>발견한 모순</h4>
          <ul className="case-contradiction-list">
            {caseBoard.contradictions.map((contradiction) => (
              <li key={contradiction.id} className={`case-contradiction sev-${contradiction.severity}`}>
                <span className="case-contradiction-type">{contradiction.conflictType}</span>
                <span className="case-contradiction-turn">T{contradiction.detectedAtTurn}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {caseBoard.openQuestions.length > 0 ? (
        <section className="case-board-section">
          <h4>풀리지 않은 의문</h4>
          <ul className="case-question-list">
            {caseBoard.openQuestions.map((question) => (
              <li key={question.id} className="case-question">
                <span className={`case-question-status ${question.status}`}>
                  {openQuestionLabel[question.status] ?? question.status}
                </span>
                <p>{question.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {caseBoard.deductions.length > 0 ? (
        <section className="case-board-section">
          <h4>내 추리</h4>
          <ul className="case-deduction-list">
            {caseBoard.deductions.map((deduction) => (
              <li key={deduction.id} className="case-deduction">
                <div className="case-deduction-head">
                  <span className={`case-deduction-verdict ${deduction.verdict}`}>
                    {verdictLabel[deduction.verdict] ?? deduction.verdict}
                  </span>
                  <span className="case-deduction-turn">T{deduction.turn}</span>
                </div>
                <p>{deduction.claim}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export function CaseDossiers({ caseBoard }: { caseBoard: CaseBoardView }) {
  if (caseBoard.dossiers.length === 0) {
    return <p className="case-board-empty">기록된 인물이 없어.</p>;
  }

  return (
    <section className="case-board-section">
      {caseBoard.dossiers.map((dossier) => (
        <article key={dossier.characterId} className="case-dossier">
          <div className="case-dossier-head">
            <strong>{dossier.displayName}</strong>
            {dossier.revealed ? <span className="case-dossier-revealed">정체 공개</span> : null}
          </div>
          {dossier.role ? <p className="case-dossier-role">{dossier.role}</p> : null}
          {dossier.surfaceTags.length > 0 ? (
            <div className="case-dossier-tags">
              {dossier.surfaceTags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
          <div className="case-dossier-meta">
            <span>호감도</span>
            <strong>{dossier.relationshipToUser}</strong>
            <span>진술</span>
            <strong>{dossier.statementIds.length}건</strong>
          </div>
        </article>
      ))}
    </section>
  );
}
