import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadScenarioPack } from "../scenario-loader";

describe("scenario loader scene devices", () => {
  test("loads the locked-room scene devices from the scenario pack", () => {
    const result = loadScenarioPack(resolve(import.meta.dir, "../../../scenarios/locked-room-mystery"));

    expect(result.success).toBe(true);
    if (!result.success) return;
    const ids = (result.pack.sceneDevices ?? []).map((device) => device.id);
    expect(ids).toContain("device-blizzard-howl");
    expect(ids.length).toBeGreaterThan(0);
  });

  test("existing pack without scene-devices.json still loads (backward compatible)", () => {
    const dir = createMinimalScenarioPack({});

    const result = loadScenarioPack(dir);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.pack.sceneDevices).toBeUndefined();
  });

  test("loads valid scene devices and never exposes hidden truth ids", () => {
    const dir = createMinimalScenarioPack({
      sceneDevices: [
        {
          id: "ok-device",
          type: "informational",
          trigger: { conditionType: "always", conditionValue: null },
          effect: {
            sceneBeat: "테이블 쪽에서 찬 공기가 샌다.",
            stateDelta: { tension: 1, factReveals: ["fact_visible"] },
            npcReactions: [{ npcId: "kang-mujin", reaction: "테이블을 본다" }],
          },
          oneShot: true,
          priority: 5,
        },
      ],
    });

    const result = loadScenarioPack(dir);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const reveals = (result.pack.sceneDevices ?? []).flatMap((d) => d.effect.stateDelta?.factReveals ?? []);
    expect(reveals).not.toContain("truth_killer_identity");
  });

  test("fails fast when a scene device reveals a hidden truth", () => {
    const dir = createMinimalScenarioPack({
      sceneDevices: [
        {
          id: "leaky-device",
          type: "informational",
          trigger: { conditionType: "always", conditionValue: null },
          effect: {
            sceneBeat: "무언가 드러난다.",
            stateDelta: { factReveals: ["truth_killer_identity"] },
          },
          oneShot: true,
        },
      ],
    });

    const result = loadScenarioPack(dir);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((error) => error.message.includes("누출 위험"))).toBe(true);
  });

  test("fails fast when a scene device references a missing npc", () => {
    const dir = createMinimalScenarioPack({
      sceneDevices: [
        {
          id: "bad-npc-device",
          type: "npc_driven",
          trigger: { conditionType: "always", conditionValue: null },
          effect: {
            sceneBeat: "누군가 반응한다.",
            npcReactions: [{ npcId: "ghost-npc", reaction: "사라진다" }],
          },
          oneShot: false,
        },
      ],
    });

    const result = loadScenarioPack(dir);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((error) => error.message.includes("ghost-npc"))).toBe(true);
  });

  test("fails fast when a scene device reveals a non-existent fact", () => {
    const dir = createMinimalScenarioPack({
      sceneDevices: [
        {
          id: "bad-fact-device",
          type: "informational",
          trigger: { conditionType: "always", conditionValue: null },
          effect: {
            sceneBeat: "단서가 드러난다.",
            stateDelta: { factReveals: ["fact_does_not_exist"] },
          },
          oneShot: false,
        },
      ],
    });

    const result = loadScenarioPack(dir);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((error) => error.message.includes("fact_does_not_exist"))).toBe(true);
  });
});

function createMinimalScenarioPack(extra: { sceneDevices?: unknown }): string {
  const dir = mkdtempSync(join(tmpdir(), "hushline-scene-devices-"));
  mkdirSync(join(dir, "characters"));
  mkdirSync(join(dir, "prompts"));
  mkdirSync(join(dir, "objectives"));

  writeJson(join(dir, "manifest.json"), {
    id: "scene-device-test",
    title: "Scene Device Test",
    subtitle: "",
    genre: "mystery",
    version: "1.0.0",
    engineVersion: ">=2.0.0",
  });
  writeJson(join(dir, "scenario-card.json"), {
    id: "scene-device-test",
    title: "Scene Device Test",
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
    handout: { secret: "", desire: "", objective: "", initialRelationshipToUser: 0 },
    relationships: [],
  });
  writeJson(join(dir, "objectives", "main.json"), { id: "solve", description: "진상을 밝힌다." });
  writeFileSync(join(dir, "prompts", "director.txt"), "", "utf-8");
  writeFileSync(join(dir, "prompts", "narrator.txt"), "", "utf-8");

  // Case knowledge with one visible fact and one hidden truth.
  writeJson(join(dir, "case-knowledge.json"), {
    publicFacts: [
      { id: "fact_visible", text: "라운지 테이블 위에 열쇠가 있었다.", tags: ["key"], category: "briefing", knownBy: "all" },
    ],
    observableFacts: [],
    testimonySeeds: [],
    hiddenTruths: [
      { id: "truth_killer_identity", label: "범인 정체", tags: ["killer"], blockedKeywords: ["범인"] },
    ],
  });

  if (extra.sceneDevices !== undefined) {
    writeJson(join(dir, "scene-devices.json"), extra.sceneDevices);
  }
  return dir;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf-8");
}
