import { useState } from "react";
import type { CaseBoardView } from "@hushline/shared";
import { CaseClues, CaseDossiers } from "./case-board-sections";

type CaseFileTab = "clues" | "dossiers";

export function PhoneCaseFile({ caseBoard }: { caseBoard?: CaseBoardView | null | undefined }) {
  const [tab, setTab] = useState<CaseFileTab>("clues");

  const isEmpty = !caseBoard || (!caseBoard.isCaseScenario && caseBoard.dossiers.length === 0);

  return (
    <div className="phone-casefile" aria-label="사건파일">
      <header className="phone-casefile-header">
        <strong>{caseBoard?.caseTitle ?? "사건 기록"}</strong>
        <div className="phone-casefile-tabs" role="tablist" aria-label="사건파일 보기">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "clues"}
            className={tab === "clues" ? "active" : ""}
            onClick={() => setTab("clues")}
          >
            단서장
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "dossiers"}
            className={tab === "dossiers" ? "active" : ""}
            onClick={() => setTab("dossiers")}
          >
            인물 기록
          </button>
        </div>
      </header>

      <div className="phone-casefile-body case-board-content">
        {isEmpty ? (
          <p className="case-board-empty">아직 정리된 기록이 없어.</p>
        ) : tab === "clues" ? (
          <CaseClues caseBoard={caseBoard!} />
        ) : (
          <CaseDossiers caseBoard={caseBoard!} />
        )}
      </div>
    </div>
  );
}
