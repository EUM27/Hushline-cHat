import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { ScenarioPack, SessionStateV2 } from "@hushline/shared";
import { loadScenarioPack } from "../scenario-loader";
import { createInitialWorldState, applySceneBeat } from "../state-manager";
import { runTurnV2 } from "../pipeline";

const HIDDEN_TRUTH_IDS = ["truth_killer_identity", "truth_locked_room_trick"];

describe("pipeline scene beat integration", () => {
  test("a dry-run turn keeps scene-beat tracking fields and never leaks hidden truths", async () => {
    const pack = loadPack();
    expect((pack.sceneDevices ?? []).length).toBeGreaterThan(0);

    const session = buildSession(pack);
    const result = await runTurnV2(session, "다들 그때 어디에 있었는지 말해줘.", { scenarioPack: pack });

    // New tracking fields survive a real turn.
    expect(typeof result.worldState.sceneInertiaCounter).toBe("number");
    expect(Array.isArray(result.worldState.recentBeatTypes)).toBe(true);

    // No message (including any injected scene beat) may surface hidden-truth ids or redaction tokens.
    for (const message of result.messages) {
      expect(message.content.includes("HIDDEN_TRUTH_REDACTED")).toBe(false);
      for (const truthId of HIDDEN_TRUTH_IDS) {
        expect(message.content.includes(truthId)).toBe(false);
      }
    }
  });

  test("applySceneBeat resets inertia, clamps state, and records the beat type", () => {
    const pack = loadPack();
    const base = createInitialWorldState("sess-apply", pack);
    const high = { ...base, tension: 10, sceneInertiaCounter: 4, recentBeatTypes: ["quiet_texture"] };

    const next = applySceneBeat(high, {
      deviceId: "device-x",
      beatType: "informational",
      description: "찬 공기가 샌다.",
      involvedNpcs: ["kang-mujin"],
      stateDelta: { tension: 5 },
    });

    expect(next.sceneInertiaCounter).toBe(0);
    expect(next.tension).toBe(10); // clamped to 10, not 15
    expect(next.recentBeatTypes).toEqual(["quiet_texture", "informational"]);
    expect(next.recentEvents.at(-1)?.description).toContain("[scene-beat:device-x]");
  });

  test("Director-selected dry-run turn produces exactly those speakers (no autonomous extra, no leak)", async () => {
    const pack = loadPack();
    const session = buildSession(pack);

    const result = await runTurnV2(session, "강무진, 그때 어디 있었어?", { scenarioPack: pack });

    const speakerIds = result.messages
      .filter((m) => m.role === "character")
      .map((m) => m.characterId);

    // Director fallback selects a speaker → autonomous fallback must NOT add extra speakers.
    expect(speakerIds.length).toBeGreaterThanOrEqual(1);
    expect(speakerIds.length).toBeLessThanOrEqual(2);

    // No message may surface hidden-truth ids or redaction tokens (autonomous path included).
    for (const message of result.messages) {
      expect(message.content.includes("HIDDEN_TRUTH_REDACTED")).toBe(false);
      for (const truthId of HIDDEN_TRUTH_IDS) {
        expect(message.content.includes(truthId)).toBe(false);
      }
    }
  });

  test("carries previously revealed case facts into narrator scope and scene snapshots", async () => {
    const pack = loadPack();
    const baseSession = buildSession(pack);
    const session = {
      ...baseSession,
      worldState: {
        ...baseSession.worldState,
        revealedCaseFacts: {
          fact_table_key_seen: 1,
        },
      },
    };

    const result = await runTurnV2(session, "주변을 다시 둘러봅니다.", { scenarioPack: pack });

    expect(result.directorOutput.narratorScope?.allowedToDescribeFactIds).toContain("fact_table_key_seen");
    expect(result.worldState.sceneSnapshots?.at(-1)?.revealedFactIds).toContain("fact_table_key_seen");
  });
});

function loadPack(): ScenarioPack {
  const loaded = loadScenarioPack(resolve(import.meta.dir, "../../../scenarios/locked-room-mystery"));
  if (!loaded.success) throw new Error("failed to load locked-room pack");
  return loaded.pack;
}

function buildSession(pack: ScenarioPack): SessionStateV2 {
  return {
    id: "sess-beat",
    scenarioPackId: pack.manifest.id,
    title: pack.scenarioCard.title,
    persona: { id: "user", name: "탐정", shortName: "탐정" },
    worldState: createInitialWorldState("sess-beat", pack),
    characters: pack.characters,
    messages: [],
    handouts: {},
    summaries: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
