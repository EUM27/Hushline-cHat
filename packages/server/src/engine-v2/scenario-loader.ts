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
  SceneOccurrenceDevice,
} from "@hushline/shared";
import {
  scenarioManifestSchema,
  scenarioCardSchema,
  characterDefinitionSchema,
  characterCardSchema,
  objectiveDefinitionSchema,
  eventTriggerSchema,
  caseKnowledgeSchema,
  sceneOccurrenceDeviceSchema,
} from "./schemas.js";
import { cardToCharacterDefinition, type CharaCardV3 } from "./card-importer.js";

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
      const fallbackId = file.replace(/\.json$/i, "");
      const raw = readJson(charactersDir, file, errors);
      if (raw === undefined) continue;

      if (looksLikeCharacterCard(raw)) {
        // chara_card_v3 (with optional hushline extension)
        const parsed = characterCardSchema.safeParse(raw);
        if (!parsed.success) {
          for (const issue of parsed.error.issues.slice(0, 5)) {
            errors.push({ file, message: `캐릭터 카드 검증 실패 [${issue.path.join(".")}]: ${issue.message}` });
          }
          continue;
        }
        characters.push(cardToCharacterDefinition(parsed.data as CharaCardV3, fallbackId));
      } else {
        // legacy inline CharacterDefinition
        const result = characterDefinitionSchema.safeParse(raw);
        if (!result.success) {
          for (const issue of result.error.issues.slice(0, 5)) {
            errors.push({ file, message: `검증 실패 [${issue.path.join(".")}]: ${issue.message}` });
          }
          continue;
        }
        characters.push(result.data as CharacterDefinition);
      }
    }
  }
  if (characters.length === 0) {
    errors.push({ file: "characters/", message: "시나리오 팩에 캐릭터가 최소 1명 필요합니다." });
  }
  validateOpeningBeatCharacterRefs(scenarioCard, characters, errors);

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

  // ── Scene Devices (optional) ──
  const sceneDevicesPath = join(abs, "scene-devices.json");
  let sceneDevices: SceneOccurrenceDevice[] = [];
  if (existsSync(sceneDevicesPath)) {
    try {
      const raw = JSON.parse(readFileSync(sceneDevicesPath, "utf-8"));
      const arr = Array.isArray(raw) ? raw : [];
      if (!Array.isArray(raw)) {
        errors.push({
          file: "scene-devices.json",
          message: "scene-devices.json은 디바이스 배열이어야 합니다.",
        });
      }
      for (const item of arr) {
        const parsed = sceneOccurrenceDeviceSchema.safeParse(item);
        if (parsed.success) {
          sceneDevices.push(parsed.data as SceneOccurrenceDevice);
        } else {
          errors.push({
            file: "scene-devices.json",
            message: `장면 장치 검증 실패: ${parsed.error.issues[0]?.message ?? "unknown"}`,
            details: JSON.stringify(item).slice(0, 200),
          });
        }
      }
    } catch (e) {
      errors.push({
        file: "scene-devices.json",
        message: `JSON 파싱 실패: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }
    if (sceneDevices.length > 0) {
      validateSceneDevices(sceneDevices, characters, caseKnowledge, scenarioCard!, errors);
    }
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
      ...(sceneDevices.length > 0 ? { sceneDevices } : {}),
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

/** Read + JSON.parse a file, pushing a load error on failure. Returns undefined on error. */
function readJson(dir: string, filename: string, errors: ScenarioLoadError[]): unknown {
  const filePath = join(dir, filename);
  if (!existsSync(filePath)) {
    errors.push({ file: filename, message: `파일을 찾을 수 없습니다: ${filePath}` });
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (e) {
    errors.push({ file: filename, message: `JSON 파싱 실패: ${e instanceof Error ? e.message : "unknown"}` });
    return undefined;
  }
}

/** A chara_card has a nested `data.name`; an inline CharacterDefinition has a top-level `id`/`name`. */
function looksLikeCharacterCard(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  if (typeof record.spec === "string" && record.spec.startsWith("chara_card")) return true;
  const data = record.data;
  return Boolean(data && typeof data === "object" && typeof (data as Record<string, unknown>).name === "string");
}

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

function validateOpeningBeatCharacterRefs(
  scenarioCard: ScenarioCardV2,
  characters: CharacterDefinition[],
  errors: ScenarioLoadError[],
): void {
  const characterIds = new Set(characters.map((character) => character.id));
  for (const beat of scenarioCard.openingBeats) {
    if (!beat.characterId) {
      continue;
    }
    if (!characterIds.has(beat.characterId)) {
      errors.push({
        file: "scenario-card.json",
        message: `openingBeat ${beat.id} characterId가 존재하지 않는 캐릭터를 참조합니다: ${beat.characterId}`,
      });
    }
    if (beat.speakerKind !== "named-actor") {
      errors.push({
        file: "scenario-card.json",
        message: `openingBeat ${beat.id} characterId는 named-actor speakerKind에서만 사용할 수 있습니다.`,
      });
    }
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

/** Collect all known fact ids from case knowledge (public + observable + extended facts). */
function collectFactIds(caseKnowledge: CaseKnowledge | undefined): Set<string> {
  if (!caseKnowledge) return new Set();
  return new Set([
    ...(caseKnowledge.facts ?? []).map((fact) => fact.id),
    ...caseKnowledge.publicFacts.map((fact) => fact.id),
    ...caseKnowledge.observableFacts.map((fact) => fact.id),
  ]);
}

/** Collect all hidden-truth fact ids (hiddenTruths refs + vault ids + hidden_truth/solution facts). */
function collectHiddenTruthIds(caseKnowledge: CaseKnowledge | undefined): Set<string> {
  if (!caseKnowledge) return new Set();
  return new Set([
    ...caseKnowledge.hiddenTruths.map((truth) => truth.id),
    ...(caseKnowledge.hiddenTruthVault?.hiddenTruthIds ?? []),
    ...(caseKnowledge.facts ?? [])
      .filter((fact) => fact.category === "hidden_truth" || fact.category === "solution")
      .map((fact) => fact.id),
  ]);
}

/**
 * Validate scene devices against character ids and case fact ids.
 * Enforces the no-hidden-truth-leak invariant on factReveals.
 */
function validateSceneDevices(
  sceneDevices: SceneOccurrenceDevice[],
  characters: CharacterDefinition[],
  caseKnowledge: CaseKnowledge | undefined,
  _scenarioCard: ScenarioCardV2,
  errors: ScenarioLoadError[],
): void {
  const characterIds = new Set(characters.map((character) => character.id));
  const factIds = collectFactIds(caseKnowledge);
  const hiddenTruthIds = collectHiddenTruthIds(caseKnowledge);

  for (const device of sceneDevices) {
    const reveals = device.effect.stateDelta?.factReveals ?? [];
    for (const factId of reveals) {
      if (hiddenTruthIds.has(factId)) {
        errors.push({
          file: "scene-devices.json",
          message: `scene device ${device.id} factReveal이 hidden truth를 참조합니다 (누출 위험): ${factId}`,
        });
      } else if (!factIds.has(factId)) {
        errors.push({
          file: "scene-devices.json",
          message: `scene device ${device.id} factReveal이 존재하지 않는 factId를 참조합니다: ${factId}`,
        });
      }
    }

    for (const reaction of device.effect.npcReactions ?? []) {
      if (!characterIds.has(reaction.npcId)) {
        errors.push({
          file: "scene-devices.json",
          message: `scene device ${device.id} npcReaction이 존재하지 않는 npcId를 참조합니다: ${reaction.npcId}`,
        });
      }
    }

    for (const change of device.effect.stateDelta?.relationshipChanges ?? []) {
      if (!characterIds.has(change.sourceId)) {
        errors.push({
          file: "scene-devices.json",
          message: `scene device ${device.id} relationshipChange sourceId가 존재하지 않습니다: ${change.sourceId}`,
        });
      }
      if (!characterIds.has(change.targetId)) {
        errors.push({
          file: "scene-devices.json",
          message: `scene device ${device.id} relationshipChange targetId가 존재하지 않습니다: ${change.targetId}`,
        });
      }
    }
  }
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
