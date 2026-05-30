import type { CaseAnswerScope, CaseInquiryFrame, ContradictionRecord, DirectorOutput } from "@hushline/shared";
import { buildRevealPermissions } from "./case-scope-resolver.js";

export function attachCaseRuntimeToDirectorOutput(
  directorOutput: DirectorOutput,
  inquiry: CaseInquiryFrame,
  answerScope: CaseAnswerScope,
): DirectorOutput {
  if (!inquiry.isCaseInquiry) {
    return directorOutput;
  }
  const revealPermissions = buildRevealPermissions(answerScope);
  return {
    ...directorOutput,
    inquiry: directorOutput.inquiry ?? inquiry,
    answerScope: directorOutput.answerScope ?? answerScope,
    revealPermissions: {
      ...revealPermissions,
      ...(directorOutput.revealPermissions ?? {}),
    },
    caseDebug: directorOutput.caseDebug ?? {
      selectedSpeakerReason: answerScope.recommendedSpeakerIds.length
        ? "case scope recommended speaker from testimony/target resolution"
        : "director/default speaker selection",
      blockedReasonSummary: answerScope.blockedTruthIds.map((truthId) => `${truthId}: hidden truth locked`),
      truthLeakRisk: inquiry.truthLeakRisk,
    },
  };
}

export function buildContradictionPlan(
  contradictions: ContradictionRecord[],
): NonNullable<DirectorOutput["contradictionPlan"]> {
  return {
    contradictionIds: contradictions.map((contradiction) => contradiction.id),
    pressureByNpc: buildPressureByNpc(contradictions),
    allowedReactionByNpc: buildAllowedReactionByNpc(contradictions),
  };
}

function buildPressureByNpc(contradictions: ContradictionRecord[]): Record<string, 0 | 1 | 2 | 3> {
  const pressureByNpc: Record<string, 0 | 1 | 2 | 3> = {};
  for (const contradiction of contradictions) {
    for (const npcId of contradiction.involvedNpcIds) {
      const reaction = contradiction.npcReaction[npcId];
      const pressure = reaction?.pressureLevel ?? (contradiction.playerNoticed ? 1 : 0);
      pressureByNpc[npcId] = Math.max(pressureByNpc[npcId] ?? 0, pressure) as 0 | 1 | 2 | 3;
    }
  }
  return pressureByNpc;
}

function buildAllowedReactionByNpc(
  contradictions: ContradictionRecord[],
): Record<string, "deflect" | "doubled_down" | "cracked" | "explained_away" | "silence"> {
  const reactions: Record<string, "deflect" | "doubled_down" | "cracked" | "explained_away" | "silence"> = {};
  for (const contradiction of contradictions) {
    for (const npcId of contradiction.involvedNpcIds) {
      const pressure = contradiction.npcReaction[npcId]?.pressureLevel ?? (contradiction.playerNoticed ? 1 : 0);
      reactions[npcId] = pressure >= 3 ? "cracked" : pressure >= 2 ? "doubled_down" : "deflect";
    }
  }
  return reactions;
}
