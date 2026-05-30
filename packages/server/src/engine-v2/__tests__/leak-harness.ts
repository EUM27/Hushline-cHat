// ──────────────────────────────────────────────
// Hidden-Truth Leak Harness — reusable helpers
// ──────────────────────────────────────────────
// Loads case scenario packs, collects hidden-truth leak signals, and asserts
// that no surface (turn messages, caseRuntime devTrace, case board) leaks them.
// Pure test utility — no production code.
// ──────────────────────────────────────────────

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CaseBoardView, ScenarioPack, SessionStateV2, TurnResultV2 } from "@hushline/shared";
import { loadScenarioPack, createInitialWorldState } from "../index.js";
import { getAllCaseFacts, getHiddenTruthIds } from "../case-knowledge.js";

export const REDACTION_TOKEN = "HIDDEN_TRUTH_REDACTED";

export interface LeakSignals {
  /** Hidden-truth fact ids that must never appear in any surfaced text. */
  ids: string[];
  /** Real solution prose (excludes the REDACTED placeholder) that must never surface. */
  truthTexts: string[];
}

/** Collect everything that would constitute a hidden-truth leak for a pack. */
export function collectLeakSignals(pack: ScenarioPack): LeakSignals {
  const caseKnowledge = pack.caseKnowledge;
  const ids = [...new Set(getHiddenTruthIds(caseKnowledge))];

  const truthTexts: string[] = [];
  for (const fact of getAllCaseFacts(caseKnowledge)) {
    const isHidden = fact.category === "hidden_truth" || fact.category === "solution" || ids.includes(fact.id);
    if (!isHidden) continue;
    const text = fact.text?.trim();
    // Only treat genuine solution prose as a leak signal; the placeholder is covered
    // separately by the redaction-token check.
    if (text && text !== REDACTION_TOKEN && !text.includes(REDACTION_TOKEN)) {
      truthTexts.push(text);
    }
  }

  return { ids, truthTexts };
}

/** Load every packaged scenario that carries a case-knowledge layer. */
export function loadCasePacks(scenariosDir: string): Array<{ id: string; pack: ScenarioPack }> {
  const abs = resolve(scenariosDir);
  if (!existsSync(abs)) return [];

  const result: Array<{ id: string; pack: ScenarioPack }> = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(abs, entry.name, "manifest.json"))) continue;
    const loaded = loadScenarioPack(join(abs, entry.name));
    if (!loaded.success) continue;
    if (!loaded.pack.caseKnowledge) continue;
    if (getHiddenTruthIds(loaded.pack.caseKnowledge).length === 0) continue;
    result.push({ id: entry.name, pack: loaded.pack });
  }
  return result;
}

/** Build a fresh session for a pack (dry-run; no connections). */
export function makeHarnessSession(pack: ScenarioPack): SessionStateV2 {
  const sessionId = `leak-harness-${pack.manifest.id}`;
  return {
    id: sessionId,
    scenarioPackId: pack.manifest.id,
    title: pack.manifest.title,
    persona: { id: "user", name: "탐정", shortName: "탐정" },
    worldState: createInitialWorldState(sessionId, pack),
    characters: pack.characters,
    messages: [],
    handouts: {},
    summaries: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Collect every player-facing text surface from a turn result + case board. */
export function collectSurfaces(result: TurnResultV2, board: CaseBoardView): Array<{ where: string; text: string }> {
  const surfaces: Array<{ where: string; text: string }> = [];

  for (const message of result.messages) {
    surfaces.push({ where: `message[${message.role}]`, text: message.content });
  }

  const allowedFacts = result.caseRuntime?.devTrace?.allowedFacts ?? [];
  if (allowedFacts.length > 0) {
    surfaces.push({ where: "caseRuntime.devTrace.allowedFacts", text: allowedFacts.join(" ") });
  }

  surfaces.push({ where: "caseBoard", text: JSON.stringify(board) });

  return surfaces;
}

/**
 * Assert that nothing in the turn result or case board leaks a hidden truth.
 * Throws with a locating message (scenario + input + surface) on the first leak.
 */
export function assertNoHiddenTruthLeak(args: {
  scenarioId: string;
  input: string;
  result: TurnResultV2;
  board: CaseBoardView;
  signals: LeakSignals;
}): void {
  const { scenarioId, input, result, board, signals } = args;
  const surfaces = collectSurfaces(result, board);

  for (const surface of surfaces) {
    for (const id of signals.ids) {
      if (surface.text.includes(id)) {
        throw new Error(
          `Hidden-truth ID leak in "${scenarioId}" via input "${input}" at ${surface.where}: id="${id}"`,
        );
      }
    }
    if (surface.text.includes(REDACTION_TOKEN)) {
      throw new Error(
        `Redaction token leak in "${scenarioId}" via input "${input}" at ${surface.where}`,
      );
    }
    for (const truth of signals.truthTexts) {
      if (surface.text.includes(truth)) {
        throw new Error(
          `Solution prose leak in "${scenarioId}" via input "${input}" at ${surface.where}`,
        );
      }
    }
  }

  // devTrace.allowedFacts must never list a hidden-truth id.
  const allowedFacts = result.caseRuntime?.devTrace?.allowedFacts ?? [];
  for (const id of signals.ids) {
    if (allowedFacts.includes(id)) {
      throw new Error(
        `Hidden-truth ID in allowedFacts in "${scenarioId}" via input "${input}": id="${id}"`,
      );
    }
  }
}
