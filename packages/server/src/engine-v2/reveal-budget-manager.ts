import type { FactId, RevealBudget, RevealLevel } from "@hushline/shared";

export function isRevealBudgetExceeded(input: {
  revealBudget?: Partial<RevealBudget>;
  factId: FactId;
  level: RevealLevel;
  currentTurn: number;
}): boolean {
  const entry = input.revealBudget?.perFact?.[input.factId];
  if (!entry) {
    return false;
  }
  if (input.level === "full" && entry.fullCount >= entry.maxFull) {
    return true;
  }
  if (input.level === "partial" && typeof entry.maxPartial === "number" && entry.partialCount >= entry.maxPartial) {
    return true;
  }
  if (input.level === "hint" && typeof entry.maxHints === "number" && entry.hintCount >= entry.maxHints) {
    return true;
  }
  if (input.level === "partial" && entry.lastPartialTurn !== undefined) {
    return input.currentTurn - entry.lastPartialTurn < entry.partialCooldownTurns;
  }
  if (input.level === "hint" && entry.lastHintTurn !== undefined) {
    return input.currentTurn - entry.lastHintTurn < entry.hintCooldownTurns;
  }
  return false;
}

export function applyRevealBudgetUse(input: {
  revealBudget: Partial<RevealBudget>;
  factId: FactId;
  level: RevealLevel;
  currentTurn: number;
}): Partial<RevealBudget> {
  const perFact = { ...(input.revealBudget.perFact ?? {}) };
  const entry = perFact[input.factId] ?? {
    hintCount: 0,
    partialCount: 0,
    fullCount: 0,
    maxFull: 1,
    hintCooldownTurns: 0,
    partialCooldownTurns: 0,
    fullResetPolicy: "never" as const,
  };
  if (input.level === "hint") {
    entry.hintCount += 1;
    entry.lastHintTurn = input.currentTurn;
  }
  if (input.level === "partial") {
    entry.partialCount += 1;
    entry.lastPartialTurn = input.currentTurn;
  }
  if (input.level === "full") {
    entry.fullCount += 1;
    entry.fullRevealedAtTurn = input.currentTurn;
  }
  perFact[input.factId] = entry;
  return { ...input.revealBudget, perFact };
}
