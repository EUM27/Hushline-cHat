import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { ScenarioPack, SessionStateV2 } from "@hushline/shared";
import { loadScenarioPack, createInitialWorldState } from "../index.js";
import { runTurnV2 } from "../pipeline";
import { buildCaseBoard } from "../../app-v2/case-board.js";

const packDir = resolve(import.meta.dir, "../../../scenarios/shared-house-romance");

function loadPack(): ScenarioPack {
  const result = loadScenarioPack(packDir);
  if (!result.success) {
    throw new Error(`failed to load romance pack: ${JSON.stringify(result.errors)}`);
  }
  return result.pack;
}

function makeSession(pack: ScenarioPack): SessionStateV2 {
  const sessionId = "romance-test";
  return {
    id: sessionId,
    scenarioPackId: pack.manifest.id,
    title: pack.manifest.title,
    persona: { id: "user", name: "한결", shortName: "한결" },
    worldState: createInitialWorldState(sessionId, pack),
    characters: pack.characters,
    messages: [],
    handouts: {},
    summaries: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("shared-house-romance pack", () => {
  test("loads as a romance pack with no case-knowledge layer", () => {
    const pack = loadPack();
    expect(pack.manifest.genre).toBe("romance");
    expect(pack.caseKnowledge).toBeUndefined();
    expect(pack.characters).toHaveLength(3);
    expect(pack.sceneDevices?.length ?? 0).toBeGreaterThan(0);
  });

  test("character relationship edges reference real characters", () => {
    const pack = loadPack();
    const ids = new Set(pack.characters.map((c) => c.id));
    for (const character of pack.characters) {
      for (const rel of character.relationships) {
        expect(ids.has(rel.targetId)).toBe(true);
      }
    }
  });

  test("scene device relationship/npc references resolve to real characters", () => {
    const pack = loadPack();
    const ids = new Set(pack.characters.map((c) => c.id));
    for (const device of pack.sceneDevices ?? []) {
      for (const reaction of device.effect.npcReactions ?? []) {
        expect(ids.has(reaction.npcId)).toBe(true);
      }
      for (const change of device.effect.stateDelta?.relationshipChanges ?? []) {
        expect(ids.has(change.sourceId)).toBe(true);
        expect(ids.has(change.targetId)).toBe(true);
      }
    }
  });

  test("createInitialWorldState seeds the relationship graph from character relationships", () => {
    const pack = loadPack();
    const world = createInitialWorldState("romance-test", pack);
    const expectedEdges = pack.characters.reduce((sum, c) => sum + c.relationships.length, 0);
    expect(world.relationshipGraph.length).toBe(expectedEdges);
    // every character starts with their authored relationship-to-user
    for (const character of pack.characters) {
      expect(world.characterStates[character.id]?.relationshipToUser).toBe(
        character.handout.initialRelationshipToUser,
      );
    }
  });

  test("a dry-run turn runs without error and yields a non-case board", async () => {
    const pack = loadPack();
    const session = makeSession(pack);
    const result = await runTurnV2(session, "유진한테 먼저 인사해볼게.", { scenarioPack: pack });

    expect(result.messages.length).toBeGreaterThan(0);

    const board = buildCaseBoard(
      { ...session, worldState: result.worldState, messages: [...session.messages, ...result.messages] },
      pack,
    );
    expect(board.isCaseScenario).toBe(false);
    expect(board.clues).toHaveLength(0);
  });
});
