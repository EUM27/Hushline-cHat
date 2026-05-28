import type {
  CaseInquiryFrame,
  Claim,
  NpcId,
  RevealBudget,
  RevealInstruction,
  RevealPermission,
  TestimonySeed,
} from "@hushline/shared";
import { isRevealBudgetExceeded } from "./reveal-budget-manager.js";

export function decideNpcFactReveal(input: {
  npcId: NpcId;
  userQuestion: string;
  inquiryFrame: CaseInquiryFrame;
  permission: RevealPermission;
  testimonySeeds: TestimonySeed[];
  claims: Claim[];
  revealBudget: Partial<RevealBudget>;
  currentTurn: number;
  npcAgenda?: {
    goal?: string;
    constraint?: string;
    nextAction?: string;
  };
  contradictionPressure?: 0 | 1 | 2 | 3;
}): RevealInstruction {
  const allowed = input.permission.allowedFactIds.filter((factId) => !input.permission.blockedTruthIds.includes(factId));
  if (input.permission.maxRevealLevel === "none" || allowed.length === 0) {
    return {
      npcId: input.npcId,
      allowedFactIds: [],
      deniedFactIds: [...new Set([...input.permission.blockedFactIds, ...input.permission.blockedTruthIds])],
      responseMode: input.permission.maxRevealLevel === "none" ? "refuse" : "deflect",
      behavior: input.permission.requiredBehavior ?? "모르면 모른다고 하거나 답을 피한다.",
    };
  }

  const requestedMode = input.contradictionPressure && input.contradictionPressure >= 2
    ? "partial"
    : input.permission.maxRevealLevel;
  const budgetedFact = allowed.find((factId) =>
    isRevealBudgetExceeded({
      revealBudget: input.revealBudget,
      factId,
      level: requestedMode,
      currentTurn: input.currentTurn,
    }),
  );
  const responseMode = budgetedFact
    ? requestedMode === "full" ? "partial" : "deflect"
    : requestedMode;

  const instruction: RevealInstruction = {
    npcId: input.npcId,
    allowedFactIds: budgetedFact && responseMode === "deflect" ? [] : allowed,
    deniedFactIds: [...new Set([...input.permission.blockedFactIds, ...input.permission.blockedTruthIds])],
    responseMode,
    behavior: (input.contradictionPressure && input.contradictionPressure >= 2
      ? "압박을 받지만 hiddenTruth는 공개하지 않고 기존 증언 일부를 수정하거나 방어한다."
      : input.permission.requiredBehavior) ?? "허용된 정보 범위 안에서만 답한다.",
  };
  if (budgetedFact) {
    instruction.budgetUsed = { factId: budgetedFact, level: responseMode };
  }
  return instruction;
}
