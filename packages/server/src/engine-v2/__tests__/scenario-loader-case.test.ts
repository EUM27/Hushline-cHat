import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadScenarioPack } from "../scenario-loader";

describe("scenario loader case knowledge", () => {
  test("loads locked-room case knowledge from the scenario pack", () => {
    const result = loadScenarioPack(resolve(import.meta.dir, "../../../scenarios/locked-room-mystery"));

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.pack.caseKnowledge?.publicFacts.map((fact) => fact.id)).toContain("pub_victim_owner");
    expect(result.pack.caseKnowledge?.hiddenTruths.map((truth) => truth.id)).toContain("truth_killer_identity");
  });

  test("locks the book solution behind a staged clue ladder", () => {
    const result = loadScenarioPack(resolve(import.meta.dir, "../../../scenarios/locked-room-mystery"));

    expect(result.success).toBe(true);
    if (!result.success) return;
    const knowledge = result.pack.caseKnowledge;
    expect(knowledge).toBeDefined();
    if (!knowledge) return;

    expect(knowledge.objects?.map((object) => object.id)).toContain("seha-book-bundle");

    const publicBookFact = knowledge.publicFacts.find((fact) => fact.id === "pub_seha_book_delivery");
    expect(publicBookFact?.text).toContain("책");
    expect(publicBookFact?.text).not.toMatch(/흉기|제본칼|범인|트릭/);

    const observableIds = knowledge.observableFacts.map((fact) => fact.id);
    expect(observableIds).toContain("fact_seha_book_bundle_present");
    expect(observableIds).toContain("fact_book_delivery_note");
    expect(observableIds).toContain("fact_book_spine_damp_stain");

    const bookFacts = knowledge.observableFacts
      .filter((fact) => fact.objectIds?.includes("seha-book-bundle"))
      .map((fact) => fact.id);
    expect(bookFacts).toEqual(expect.arrayContaining([
      "fact_seha_book_bundle_present",
      "fact_book_delivery_note",
      "fact_book_spine_damp_stain",
    ]));

    const meansNode = knowledge.hiddenTruthVault?.solutionGraph.requiredProofNodes
      .find((node) => node.id === "means_hidden_weapon_trace");
    expect(meansNode?.requiredRefs).toEqual(expect.arrayContaining([
      "fact_seha_book_bundle_present",
      "fact_book_spine_damp_stain",
    ]));
  });

  test("fails fast when testimony seeds reference missing fact ids", () => {
    const dir = createMinimalScenarioPack({
      caseKnowledge: {
        publicFacts: [],
        observableFacts: [],
        testimonySeeds: [{
          id: "bad-testimony",
          characterId: "kang-mujin",
          factIds: ["missing_fact"],
          topicTags: ["key"],
          defaultRevealLevel: "partial",
          certainty: "uncertain",
          canSay: ["못 봤다."],
          mustNotSay: [],
        }],
        hiddenTruths: [],
      },
    });

    const result = loadScenarioPack(dir);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((error) => error.message.includes("missing_fact"))).toBe(true);
  });

  test("fails fast when public case facts leak hidden truth prose", () => {
    const dir = createMinimalScenarioPack({
      caseKnowledge: {
        publicFacts: [{
          id: "pub_leak",
          text: "범인은 하진우다.",
          tags: ["killer", "truth"],
          category: "briefing",
        }],
        observableFacts: [],
        testimonySeeds: [],
        hiddenTruths: [{ id: "truth_killer_identity", label: "범인 정체", tags: ["killer"], blockedKeywords: ["범인"] }],
      },
    });

    const result = loadScenarioPack(dir);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((error) => error.message.includes("hiddenTruth leak"))).toBe(true);
  });
});

function createMinimalScenarioPack(extra: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "hushline-case-pack-"));
  mkdirSync(join(dir, "characters"));
  mkdirSync(join(dir, "prompts"));
  mkdirSync(join(dir, "objectives"));

  writeJson(join(dir, "manifest.json"), {
    id: "case-test",
    title: "Case Test",
    subtitle: "",
    genre: "mystery",
    version: "1.0.0",
    engineVersion: ">=2.0.0",
  });
  writeJson(join(dir, "scenario-card.json"), {
    id: "case-test",
    title: "Case Test",
    subtitle: "",
    description: "",
    spaceRules: [],
    chatRules: [],
    toneRules: [],
    hardNos: [],
    backgroundIds: ["lodge-foyer"],
    initialLocationId: "lodge-foyer",
    initialBackgroundId: "lodge-foyer",
    initialSceneMode: "dialogue",
    interventionPrompt: "",
    openingBeats: [],
  });
  writeJson(join(dir, "characters", "kang-mujin.json"), {
    id: "kang-mujin",
    name: "강무진",
    shortName: "무진",
    role: "형사",
    profileKind: "named-actor",
    mbti: "ISTJ",
    ocean: { openness: 4, conscientiousness: 8, extraversion: 3, agreeableness: 3, neuroticism: 4 },
    autonomy: 0.8,
    systemPrompt: "강무진으로 말한다.",
    handout: {
      secret: "",
      desire: "",
      objective: "",
      initialRelationshipToUser: 0,
    },
    relationships: [],
  });
  writeJson(join(dir, "objectives", "main.json"), { id: "solve", description: "진상을 밝힌다." });
  writeFileSync(join(dir, "prompts", "director.txt"), "", "utf-8");
  writeFileSync(join(dir, "prompts", "narrator.txt"), "", "utf-8");
  writeJson(join(dir, "case-knowledge.json"), extra.caseKnowledge);
  return dir;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf-8");
}
