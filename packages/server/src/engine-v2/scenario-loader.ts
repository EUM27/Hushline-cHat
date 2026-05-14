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
  ObjectiveDefinition,
  EventTrigger,
} from "@hushline/shared";
import {
  scenarioManifestSchema,
  scenarioCardSchema,
  characterDefinitionSchema,
  objectiveDefinitionSchema,
  eventTriggerSchema,
} from "./schemas.js";

export interface ScenarioLoadError {
  file: string;
  message: string;
  details?: string;
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
