// ──────────────────────────────────────────────
// Engine v2 — Scenario Pack Loader
// ──────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type {
  ScenarioPack,
  ScenarioManifest,
  ScenarioCardV2,
  CharacterDefinition,
  CaseKnowledge,
  ObjectiveDefinition,
  EventTrigger,
} from "@hushline/shared";
import {
  scenarioManifestSchema,
  scenarioCardSchema,
  characterDefinitionSchema,
  objectiveDefinitionSchema,
  eventTriggerSchema,
  caseKnowledgeSchema,
} from "./schemas.js";

export interface ScenarioLoadError {
  file: string;
  message: string;
  details?: string;
}

export interface ScenarioValidationReport {
  valid: boolean;
  missingFactRefs: Array<{
    file: string;
    path: string;
    missingFactId: string;
  }>;
  missingClaimRefs: string[];
  missingLocationRefs: string[];
  missingObjectRefs: string[];
  invalidTimelineRefs: string[];
  invalidRevealConditionRefs: string[];
  hiddenTruthLeakRisks: Array<{
    file: string;
    field: string;
    reason: string;
  }>;
}

export type ScenarioLoadResult =
  | { success: true; pack: ScenarioPack }
  | { success: false; errors: ScenarioLoadError[] };

/**
 * Load and validate a scenario pack from a directory.
 *
 * Expected structure:
 *   <packDir>/
 *     manifest.json
 *     scenario-card.json
 *     characters/
 *       *.json
 *     prompts/
 *       director.txt
 *       narrator.txt
 *     objectives/
 *       main.json
 *     events/
 *       triggers.json  (optional)
 *     case-knowledge.json  (optional)
 */
export function loadScenarioPack(packDir: string): ScenarioLoadResult {
  const errors: ScenarioLoadError[] = [];
  const abs = resolve(packDir);

  // ── Manifest ──
  const manifest = loadJsonFile<ScenarioManifest>(
    abs, "manifest.json", scenarioManifestSchema, errors,
  );
  if (!manifest) {
    return { success: false, errors };
  }

  // ── Scenario Card ──
  const scenarioCard = loadJsonFile<ScenarioCardV2>(
    abs, "scenario-card.json", scenarioCardSchema, errors,
  );
  if (!scenarioCard) {
    return { success: false, errors };
  }

  // ── Characters ──
  const charactersDir = join(abs, "characters");
  const characters: CharacterDefinition[] = [];
  if (existsSync(charactersDir)) {
    const files = readdirSync(charactersDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const char = loadJsonFile<CharacterDefinition>(
        charactersDir, file, characterDefinitionSchema, errors,
      );
      if (char) characters.push(char);
    }
  }
  if (characters.length === 0) {
    errors.push({ file: "characters/", message: "시나리오 팩에 캐릭터가 최소 1명 필요합니다." });
  }

  // ── Prompts ──
  const directorPrompt = loadTextFile(abs, "prompts/director.txt", errors);
  const narratorPrompt = loadTextFile(abs, "prompts/narrator.txt", errors);

  // ── Main Objective ──
  const mainObjective = loadJsonFile<ObjectiveDefinition>(
    join(abs, "objectives"), "main.json", objectiveDefinitionSchema, errors,
  );

  // ── Event Triggers (optional) ──
  const triggersPath = join(abs, "events", "triggers.json");
  let eventTriggers: EventTrigger[] = [];
  if (existsSync(triggersPath)) {
    try {
      const raw = JSON.parse(readFileSync(triggersPath, "utf-8"));
      const arr = Array.isArray(raw) ? raw : [];
      for (const item of arr) {
        const parsed = eventTriggerSchema.safeParse(item);
        if (parsed.success) {
          eventTriggers.push(parsed.data as EventTrigger);
        } else {
          errors.push({
            file: "events/triggers.json",
            message: `이벤트 트리거 검증 실패: ${parsed.error.issues[0]?.message ?? "unknown"}`,
            details: JSON.stringify(item).slice(0, 200),
          });
        }
      }
    } catch (e) {
      errors.push({
        file: "events/triggers.json",
        message: `JSON 파싱 실패: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }
  }

  // ── Case Knowledge (optional) ──
  const caseKnowledgePath = join(abs, "case-knowledge.json");
  let caseKnowledge: CaseKnowledge | undefined;
  if (existsSync(caseKnowledgePath)) {
    caseKnowledge = loadJsonFile<CaseKnowledge>(
      abs, "case-knowledge.json", caseKnowledgeSchema, errors,
    ) ?? undefined;
  }

  if (caseKnowledge) {
    validateCaseKnowledge(caseKnowledge, characters, scenarioCard!, errors);
  }

  // ── Final validation ──
  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    pack: {
      manifest: manifest!,
      scenarioCard: scenarioCard!,
      characters,
      directorPrompt: directorPrompt ?? "",
      narratorPrompt: narratorPrompt ?? "",
      mainObjective: mainObjective ?? { id: "default", description: "시나리오를 진행한다." },
      eventTriggers,
      ...(caseKnowledge ? { caseKnowledge } : {}),
    },
  };
}

/**
 * List available scenario pack IDs from a scenarios directory.
 */
export function listScenarioPacks(scenariosDir: string): string[] {
  const abs = resolve(scenariosDir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(abs, entry.name, "manifest.json")))
    .map((entry) => entry.name);
}

// ── Helpers ──

function loadJsonFile<T>(
  dir: string,
  filename: string,
  schema: { safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: { issues: Array<{ message: string; path: Array<string | number | symbol> }> } } },
  errors: ScenarioLoadError[],
): T | null {
  const filePath = join(dir, filename);
  if (!existsSync(filePath)) {
    errors.push({ file: filename, message: `파일을 찾을 수 없습니다: ${filePath}` });
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (e) {
    errors.push({
      file: filename,
      message: `JSON 파싱 실패: ${e instanceof Error ? e.message : "unknown"}`,
    });
    return null;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error?.issues ?? [];
    for (const issue of issues.slice(0, 5)) {
      errors.push({
        file: filename,
        message: `검증 실패 [${issue.path.join(".")}]: ${issue.message}`,
      });
    }
    return null;
  }

  return result.data as T;
}

function loadTextFile(
  baseDir: string,
  relativePath: string,
  errors: ScenarioLoadError[],
): string | null {
  const filePath = join(baseDir, relativePath);
  if (!existsSync(filePath)) {
    errors.push({ file: relativePath, message: `파일을 찾을 수 없습니다: ${filePath}` });
    return null;
  }

  try {
    return readFileSync(filePath, "utf-8").trim();
  } catch (e) {
    errors.push({
      file: relativePath,
      message: `파일 읽기 실패: ${e instanceof Error ? e.message : "unknown"}`,
    });
    return null;
  }
}

function validateCaseKnowledge(
  caseKnowledge: CaseKnowledge,
  characters: CharacterDefinition[],
  scenarioCard: ScenarioCardV2,
  errors: ScenarioLoadError[],
): void {
  const factIds = new Set([
    ...(caseKnowledge.facts ?? []).map((fact) => fact.id),
    ...caseKnowledge.publicFacts.map((fact) => fact.id),
    ...caseKnowledge.observableFacts.map((fact) => fact.id),
  ]);
  const characterIds = new Set(characters.map((character) => character.id));
  const objectIds = new Set(
    [
      ...(caseKnowledge.objects ?? []).map((object) => object.id),
      ...[...(caseKnowledge.facts ?? []), ...caseKnowledge.publicFacts, ...caseKnowledge.observableFacts]
      .flatMap((fact) => fact.objectIds ?? []),
    ],
  );
  const locationIds = new Set([
    scenarioCard.initialLocationId,
    scenarioCard.initialBackgroundId,
    ...scenarioCard.backgroundIds,
    ...(caseKnowledge.locations ?? []).map((location) => location.id),
    ...[...(caseKnowledge.facts ?? []), ...caseKnowledge.publicFacts, ...caseKnowledge.observableFacts]
      .map((fact) => fact.locationId)
      .filter((id): id is string => Boolean(id)),
  ]);
  const hiddenTruthIds = new Set([
    ...caseKnowledge.hiddenTruths.map((truth) => truth.id),
    ...(caseKnowledge.hiddenTruthVault?.hiddenTruthIds ?? []),
  ]);

  for (const seed of caseKnowledge.testimonySeeds) {
    const characterId = seed.npcId ?? seed.characterId;
    if (!characterIds.has(characterId)) {
      errors.push({
        file: "case-knowledge.json",
        message: `testimonySeed ${seed.id} references missing characterId: ${characterId}`,
      });
    }
    for (const factId of [...(seed.factRefs ?? []), ...seed.factIds]) {
      if (!factIds.has(factId)) {
        errors.push({
          file: "case-knowledge.json",
          message: `testimonySeed ${seed.id} references missing factId: ${factId}`,
        });
      }
    }
    for (const objectId of seed.revealWhen?.objectIds ?? []) {
      if (!objectIds.has(objectId)) {
        errors.push({
          file: "case-knowledge.json",
          message: `testimonySeed ${seed.id} references missing objectId: ${objectId}`,
        });
      }
    }
    for (const locationId of seed.revealWhen?.locationIds ?? []) {
      if (!locationIds.has(locationId)) {
        errors.push({
          file: "case-knowledge.json",
          message: `testimonySeed ${seed.id} references missing locationId: ${locationId}`,
        });
      }
    }
  }

  for (const hiddenTruthId of hiddenTruthIds) {
    if (!factIds.has(hiddenTruthId) && !caseKnowledge.hiddenTruths.some((truth) => truth.id === hiddenTruthId)) {
      errors.push({
        file: "case-knowledge.json",
        message: `hiddenTruth references missing factId: ${hiddenTruthId}`,
      });
    }
  }

  for (const factId of Object.keys(caseKnowledge.revealBudget?.perFact ?? {})) {
    if (!factIds.has(factId)) {
      errors.push({
        file: "case-knowledge.json",
        message: `revealBudget references missing factId: ${factId}`,
      });
    }
  }

  for (const node of caseKnowledge.hiddenTruthVault?.solutionGraph.requiredProofNodes ?? []) {
    for (const ref of node.requiredRefs) {
      if (!isValidSolutionRef(ref, factIds)) {
        errors.push({
          file: "case-knowledge.json",
          message: `solutionGraph proof node ${node.id} references invalid ref: ${ref}`,
        });
      }
    }
  }

  for (const timeline of caseKnowledge.timeline ?? []) {
    for (const factId of timeline.eventRefs ?? []) {
      if (!factIds.has(factId)) {
        errors.push({
          file: "case-knowledge.json",
          message: `timeline ${timeline.id} references missing factId: ${factId}`,
        });
      }
    }
    for (const [locationId, state] of Object.entries(timeline.locationStates ?? {})) {
      if (!locationIds.has(locationId)) {
        errors.push({
          file: "case-knowledge.json",
          message: `timeline ${timeline.id} references missing locationId: ${locationId}`,
        });
      }
      for (const objectId of state.observableObjects ?? []) {
        if (!objectIds.has(objectId)) {
          errors.push({
            file: "case-knowledge.json",
            message: `timeline ${timeline.id} references missing objectId: ${objectId}`,
          });
        }
      }
      for (const factId of state.observableFactIds ?? []) {
        if (!factIds.has(factId)) {
          errors.push({
            file: "case-knowledge.json",
            message: `timeline ${timeline.id} references missing factId: ${factId}`,
          });
        }
      }
    }
  }

  for (const object of caseKnowledge.objects ?? []) {
    if (object.initialLocationId && !locationIds.has(object.initialLocationId)) {
      errors.push({
        file: "case-knowledge.json",
        message: `object ${object.id} references missing locationId: ${object.initialLocationId}`,
      });
    }
    for (const factId of object.factRefs ?? []) {
      if (!factIds.has(factId)) {
        errors.push({
          file: "case-knowledge.json",
          message: `object ${object.id} references missing factId: ${factId}`,
        });
      }
    }
  }

  for (const ambiguous of caseKnowledge.ambiguousFacts ?? []) {
    for (const interpretation of ambiguous.possibleInterpretations) {
      for (const factId of [...interpretation.supportingFactIds, ...interpretation.contradictingFactIds]) {
        if (!factIds.has(factId)) {
          errors.push({
            file: "case-knowledge.json",
            message: `ambiguousFact ${ambiguous.id} references missing factId: ${factId}`,
          });
        }
      }
    }
  }

  for (const leak of detectHiddenTruthLeakRisks(caseKnowledge)) {
    errors.push({
      file: leak.file,
      message: `hiddenTruth leak risk [${leak.field}]: ${leak.reason}`,
    });
  }
}

function isValidSolutionRef(ref: string, factIds: Set<string>): boolean {
  return factIds.has(ref)
    || ref.startsWith("claim_")
    || ref.startsWith("evidence_")
    || ref.startsWith("contra_")
    || ref.startsWith("contradiction_");
}

function detectHiddenTruthLeakRisks(caseKnowledge: CaseKnowledge): ScenarioValidationReport["hiddenTruthLeakRisks"] {
  const leakPatterns = [
    /범인\s*(은|는|이|가)\s*[가-힣A-Za-z0-9_-]+/,
    /살인범\s*(은|는|이|가)\s*[가-힣A-Za-z0-9_-]+/,
    /정답\s*(은|는|이|가)/,
    /트릭\s*(은|는|이|가|:)/,
  ];
  const risks: ScenarioValidationReport["hiddenTruthLeakRisks"] = [];
  const publicFacts = [
    ...caseKnowledge.publicFacts.map((fact) => ({ file: "case-knowledge.json", field: `publicFacts.${fact.id}.text`, text: fact.text })),
    ...caseKnowledge.observableFacts.map((fact) => ({ file: "case-knowledge.json", field: `observableFacts.${fact.id}.text`, text: fact.text })),
    ...(caseKnowledge.facts ?? [])
      .filter((fact) => fact.category !== "hidden_truth" && fact.category !== "solution")
      .map((fact) => ({ file: "case-knowledge.json", field: `facts.${fact.id}.text`, text: fact.text })),
  ];
  for (const item of publicFacts) {
    if (item.text.includes("HIDDEN_TRUTH_REDACTED")) {
      continue;
    }
    if (leakPatterns.some((pattern) => pattern.test(item.text))) {
      risks.push({
        file: item.file,
        field: item.field,
        reason: "public case knowledge contains solution-like prose",
      });
    }
  }
  return risks;
}
