import { useState } from "react";
import type { CaseBoardView } from "@hushline/shared";
import type { VisualThemePreset } from "../types/ui";
import { createVisualThemeStyle } from "../utils/theme";
import { CaseClues, CaseDossiers } from "./case-board-sections";

type CaseBoardTab = "clues" | "dossiers";

export function CaseBoardPanel({
  caseBoard,
  open,
  theme,
}: {
  caseBoard?: CaseBoardView | null | undefined;
  open: boolean;
  theme: VisualThemePreset;
}) {
  const [tab, setTab] = useState<CaseBoardTab>("clues");

  return (
    <aside
      className={`case-board-panel ${open ? "open" : ""}`}
      style={createVisualThemeStyle(theme)}
      aria-hidden={!open}
    >
      {open && (
        <div className="case-board-content">
          <header className="case-board-header">
            <h3>{caseBoard?.caseTitle ?? "사건 기록"}</h3>
            <div className="case-board-tabs" role="tablist" aria-label="사건 기록 보기">
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

          {!caseBoard || (!caseBoard.isCaseScenario && caseBoard.dossiers.length === 0) ? (
            <p className="case-board-empty">아직 정리된 기록이 없어.</p>
          ) : tab === "clues" ? (
            <CaseClues caseBoard={caseBoard} />
          ) : (
            <CaseDossiers caseBoard={caseBoard} />
          )}
        </div>
      )}
    </aside>
  );
}
