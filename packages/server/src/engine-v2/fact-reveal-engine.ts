// ──────────────────────────────────────────────
// Engine v2 — NPC Fact Reveal Engine
// ──────────────────────────────────────────────
// Decides: "NPC가 지금 그것을 말할 것인가"
// ──────────────────────────────────────────────

import type { RevealCondition, RevealLevel, RevealBudget } from "@hushline/shared";

export interface RevealDecision {
  factId: string | null;
  revealLevel: RevealLevel;
  behavior: string;
  bodyLanguage: string;
  budgetConsumed: { full: number; partial: number; hint: number };
}

export interface RevealInput {
  userQuestion: string;
  npcId: string;
  mentionedTopics: string[];
  referencedEvidence: string[];
  currentTrust: number;
  isAlone: boolean;
  currentLocation: string;
  directorRevealPermissions: string[]; // fact_ids Director allowed
}

/**
 * Evaluate whether an NPC should reveal a fact this turn.
 * Returns the reveal decision with level and behavior.
 */
export function evaluateReveal(
  input: RevealInput,
  policies: RevealCondition[],
  budgetRemaining: RevealBudget["perTurn"],
): RevealDecision {
  // Find matching policy based on mentioned topics
  const matchingPolicy = policies.find((policy) => {
    if (policy.npcId !== input.npcId) return false;
    if (!input.directorRevealPermissions.includes(policy.factId)) return false;
    return checkTopicMatch(input.mentionedTopics, policy);
  });

  if (!matchingPolicy) {
    return { factId: null, revealLevel: "none", behavior: "", bodyLanguage: "", budgetConsumed: { full: 0, partial: 0, hint: 0 } };
  }

  // Check conditions
  const conditionsMet = checkConditions(matchingPolicy, input);
  if (!conditionsMet) {
    return {
      factId: matchingPolicy.factId,
      revealLevel: "none",
      behavior: matchingPolicy.onConditionNotMet.behavior,
      bodyLanguage: "",
      budgetConsumed: { full: 0, partial: 0, hint: 0 },
    };
  }

  // Check budget
  const level = matchingPolicy.revealLevel;
  if (!hasBudget(level, budgetRemaining)) {
    return {
      factId: matchingPolicy.factId,
      revealLevel: "none",
      behavior: "NPC가 말을 끊거나 화제를 돌림 (예산 초과)",
      bodyLanguage: "",
      budgetConsumed: { full: 0, partial: 0, hint: 0 },
    };
  }

  return {
    factId: matchingPolicy.factId,
    revealLevel: level,
    behavior: matchingPolicy.revealBehavior.speechStyle,
    bodyLanguage: matchingPolicy.revealBehavior.bodyLanguage ?? "",
    budgetConsumed: getBudgetCost(level),
  };
}

function checkTopicMatch(topics: string[], policy: RevealCondition): boolean {
  if (!policy.conditions.requiresTopicMention) return true;
  return policy.conditions.requiresTopicMention.some((t) =>
    topics.some((topic) => topic.includes(t) || t.includes(topic)),
  );
}

function checkConditions(policy: RevealCondition, input: RevealInput): boolean {
  const c = policy.conditions;
  if (c.requiresTrust && input.currentTrust < c.requiresTrust) return false;
  if (c.requiresAlone && !input.isAlone) return false;
  if (c.requiresLocation && input.currentLocation !== c.requiresLocation) return false;
  if (c.requiresEvidence?.length) {
    if (!c.requiresEvidence.every((e) => input.referencedEvidence.includes(e))) return false;
  }
  if (c.requiresDirectAsk && input.mentionedTopics.length === 0) return false;
  return true;
}

function hasBudget(level: RevealLevel, budget: RevealBudget["perTurn"]): boolean {
  if (level === "full" && budget.maxFullReveals <= 0) return false;
  if (level === "partial" && budget.maxPartialReveals <= 0) return false;
  if (level === "hint" && budget.maxHints <= 0) return false;
  return true;
}

function getBudgetCost(level: RevealLevel): { full: number; partial: number; hint: number } {
  if (level === "full") return { full: 1, partial: 0, hint: 0 };
  if (level === "partial") return { full: 0, partial: 1, hint: 0 };
  if (level === "hint") return { full: 0, partial: 0, hint: 1 };
  return { full: 0, partial: 0, hint: 0 };
}
