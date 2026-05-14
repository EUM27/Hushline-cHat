// ──────────────────────────────────────────────
// Engine v2 — Visibility Graph
// ──────────────────────────────────────────────
// Decides: "NPC가 무엇을 아는가"
// ──────────────────────────────────────────────

import type { FactVisibility } from "@hushline/shared";

/**
 * Check if an agent knows a specific fact.
 */
export function agentKnowsFact(
  facts: FactVisibility[],
  factId: string,
  agentId: string,
): { knows: boolean; source: string; confidence: number } {
  const fact = facts.find((f) => f.factId === factId);
  if (!fact) return { knows: false, source: "", confidence: 0 };

  // Check blocked list first
  if (fact.blockedFrom.some((b) => b.agentId === agentId)) {
    return { knows: false, source: "blocked", confidence: 0 };
  }

  const entry = fact.knownBy.find((k) => k.agentId === agentId);
  if (!entry) return { knows: false, source: "", confidence: 0 };

  return { knows: true, source: entry.source, confidence: entry.confidence };
}

/**
 * Get all facts an agent knows.
 */
export function getAgentKnowledge(
  facts: FactVisibility[],
  agentId: string,
): FactVisibility[] {
  return facts.filter((fact) => {
    if (fact.blockedFrom.some((b) => b.agentId === agentId)) return false;
    return fact.knownBy.some((k) => k.agentId === agentId);
  });
}

/**
 * Reveal a fact to an agent (add to knownBy).
 */
export function revealFactToAgent(
  facts: FactVisibility[],
  factId: string,
  agentId: string,
  source: string,
): FactVisibility[] {
  return facts.map((fact) => {
    if (fact.factId !== factId) return fact;
    if (fact.knownBy.some((k) => k.agentId === agentId)) return fact;
    return {
      ...fact,
      knownBy: [...fact.knownBy, { agentId, source, confidence: 1.0 }],
    };
  });
}

/**
 * Auto-propagate fact to agents in same location (on reveal).
 */
export function propagateOnReveal(
  facts: FactVisibility[],
  factId: string,
  presentAgentIds: string[],
): FactVisibility[] {
  return facts.map((fact) => {
    if (fact.factId !== factId) return fact;
    const newKnownBy = [...fact.knownBy];
    for (const rule of fact.autoPropagateOnReveal) {
      const targets = rule.agentId === "all_present" ? presentAgentIds : [rule.agentId];
      for (const targetId of targets) {
        if (!newKnownBy.some((k) => k.agentId === targetId)) {
          if (!fact.blockedFrom.some((b) => b.agentId === targetId)) {
            newKnownBy.push({ agentId: targetId, source: "witnessed_reveal", confidence: 1.0 });
          }
        }
      }
    }
    return { ...fact, knownBy: newKnownBy };
  });
}
