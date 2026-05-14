// ──────────────────────────────────────────────
// Engine v2 — API Routes
// ──────────────────────────────────────────────
// Mounted alongside v1 routes during migration.
// All v2 endpoints live under /api/v2/
// ──────────────────────────────────────────────

import { Hono } from "hono";
import { z } from "zod";
import { resolve } from "node:path";
import type { ModelConnection, SessionStateV2, TurnMessage } from "@hushline/shared";
import { loadScenarioPack, listScenarioPacks, createInitialWorldState, runTurnV2, rollbackTurn } from "./engine-v2/index.js";
import { createSqliteStoreV2, type SessionStoreV2 } from "./store/sqlite-store-v2.js";

// ── Schemas ──

const modelProviderIdSchema = z.enum(["nanogpt", "openrouter"]);

const modelConnectionSchema = z.object({
  providerId: modelProviderIdSchema,
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1),
  baseUrl: z.string().trim().url().optional(),
});

const createSessionBodySchema = z.object({
  scenarioPackId: z.string().trim().min(1).max(120),
  persona: z.object({
    name: z.string().trim().max(80).default("{{유저}}"),
  }).optional(),
  connections: z.record(z.string(), modelConnectionSchema).optional(),
});

const advanceBodySchema = z.object({
  content: z.string().trim().min(1).max(4000),
  inputMode: z.enum(["chat", "action", "whisper"]).optional(),
  connections: z.record(z.string(), modelConnectionSchema).optional(),
});

// ── App ──

export interface CreateAppV2Options {
  store?: SessionStoreV2;
  scenariosDir?: string;
}

export function createAppV2(options: CreateAppV2Options = {}) {
  const store = options.store ?? createSqliteStoreV2();
  const scenariosDir = options.scenariosDir ?? resolve("packages/server/scenarios");
  const app = new Hono();

  // ── List available scenario packs ──
  app.get("/api/v2/scenarios", (context) => {
    const packs = listScenarioPacks(scenariosDir);
    return context.json({ scenarios: packs });
  });

  // ── Load scenario pack details ──
  app.get("/api/v2/scenarios/:packId", (context) => {
    const packId = context.req.param("packId");
    const packDir = resolve(scenariosDir, packId);
    const result = loadScenarioPack(packDir);

    if (!result.success) {
      return context.json({ error: "Scenario pack validation failed", details: result.errors }, 400);
    }

    // Return manifest + card (not full prompts for security)
    return context.json({
      manifest: result.pack.manifest,
      scenarioCard: result.pack.scenarioCard,
      characters: result.pack.characters.map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        role: c.role,
        anonymousLabel: c.anonymousLabel,
        autonomy: c.autonomy,
      })),
      mainObjective: result.pack.mainObjective,
    });
  });

  // ── Create session ──
  app.post("/api/v2/sessions", async (context) => {
    const parsed = createSessionBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Invalid session request", details: parsed.error.issues }, 400);
    }

    const { scenarioPackId, persona } = parsed.data;
    const packDir = resolve(scenariosDir, scenarioPackId);
    const packResult = loadScenarioPack(packDir);

    if (!packResult.success) {
      return context.json({ error: "Scenario pack failed to load", details: packResult.errors }, 400);
    }

    const pack = packResult.pack;
    const sessionId = crypto.randomUUID();
    const worldState = createInitialWorldState(sessionId, pack);

    // Build initial handouts
    const handouts: Record<string, { secret: string; desire: string; objective: string; relationshipToUser: number; knownFacts: string[]; myRelationships: Array<{ sourceId: string; targetId: string; descriptor: string; intensity: number }>; autonomy: number; characterId: string }> = {};
    for (const charDef of pack.characters) {
      handouts[charDef.id] = {
        characterId: charDef.id,
        secret: charDef.handout.secret,
        desire: charDef.handout.desire,
        objective: charDef.handout.objective,
        relationshipToUser: charDef.handout.initialRelationshipToUser,
        knownFacts: [],
        myRelationships: worldState.relationshipGraph.filter((e) => e.sourceId === charDef.id),
        autonomy: charDef.autonomy,
      };
    }

    // Build opening messages
    const openingMessages: TurnMessage[] = pack.scenarioCard.openingBeats.map((beat) => ({
      id: crypto.randomUUID(),
      sessionId,
      role: beat.role,
      content: beat.content,
      speakerLabel: beat.speakerLabel,
      createdAt: new Date().toISOString(),
    }));

    const session: SessionStateV2 = {
      id: sessionId,
      scenarioPackId,
      title: pack.manifest.title,
      persona: {
        id: "user",
        name: persona?.name ?? "{{유저}}",
        shortName: persona?.name ?? "{{유저}}",
      },
      worldState,
      characters: pack.characters,
      messages: openingMessages,
      handouts,
      summaries: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.saveSession(session);
    return context.json({ session: toClientSession(session) }, 201);
  });

  // ── Get session ──
  app.get("/api/v2/sessions/:id", (context) => {
    const session = store.getSession(context.req.param("id"));
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }
    return context.json({ session: toClientSession(session) });
  });

  // ── Advance (main turn) ──
  app.post("/api/v2/sessions/:id/advance", async (context) => {
    const session = store.getSession(context.req.param("id"));
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }

    const parsed = advanceBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Invalid advance request" }, 400);
    }

    const turnResult = await runTurnV2(session, parsed.data.content, {
      ...(parsed.data.connections ? { connections: parsed.data.connections as Record<string, ModelConnection> } : {}),
      ...(parsed.data.inputMode ? { inputMode: parsed.data.inputMode } : {}),
    });

    // Update session
    const nextSession: SessionStateV2 = {
      ...session,
      worldState: turnResult.worldState,
      messages: [...session.messages, ...turnResult.messages],
      updatedAt: new Date().toISOString(),
    };
    store.saveSession(nextSession);

    return context.json({
      session: nextSession,
      turn: {
        messages: turnResult.messages,
        directorOutput: turnResult.directorOutput,
      },
    });
  });

  // ── Reroll ──
  app.post("/api/v2/sessions/:id/reroll", async (context) => {
    const session = store.getSession(context.req.param("id"));
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }

    const parsed = advanceBodySchema.safeParse(await context.req.json().catch(() => ({})));
    const connections = parsed.success && parsed.data.connections
      ? (parsed.data.connections as Record<string, ModelConnection>)
      : undefined;
    const inputMode = parsed.success ? parsed.data.inputMode : undefined;

    // Find last user message
    const lastUserIndex = findLastIndex(session.messages, (m) => m.role === "user");
    if (lastUserIndex === -1) {
      return context.json({ error: "No user message to reroll" }, 400);
    }

    const lastUserMessage = session.messages[lastUserIndex]!;
    const rolledBackMessages = session.messages.slice(0, lastUserIndex);
    const rolledBackState = rollbackTurn(session.worldState);

    const rolledBackSession: SessionStateV2 = {
      ...session,
      messages: rolledBackMessages,
      worldState: rolledBackState,
    };

    const turnResult = await runTurnV2(rolledBackSession, lastUserMessage.content, {
      ...(connections ? { connections } : {}),
      inputMode: lastUserMessage.inputMode ?? inputMode ?? "chat",
    });

    const nextSession: SessionStateV2 = {
      ...rolledBackSession,
      worldState: turnResult.worldState,
      messages: [...rolledBackMessages, ...turnResult.messages],
      updatedAt: new Date().toISOString(),
    };
    store.saveSession(nextSession);

    return context.json({
      session: nextSession,
      turn: {
        messages: turnResult.messages,
        directorOutput: turnResult.directorOutput,
      },
    });
  });

  // ── Undo ──
  app.post("/api/v2/sessions/:id/undo", async (context) => {
    const session = store.getSession(context.req.param("id"));
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }

    const lastUserIndex = findLastIndex(session.messages, (m) => m.role === "user");
    if (lastUserIndex === -1) {
      return context.json({ error: "No messages to undo" }, 400);
    }

    const rolledBackMessages = session.messages.slice(0, lastUserIndex);
    const nextSession: SessionStateV2 = {
      ...session,
      messages: rolledBackMessages,
      worldState: rollbackTurn(session.worldState),
      updatedAt: new Date().toISOString(),
    };
    store.saveSession(nextSession);

    return context.json({ session: nextSession });
  });

  return app;
}

// ── Helpers ──

function findLastIndex<T>(array: T[], predicate: (item: T) => boolean): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i]!)) return i;
  }
  return -1;
}

/**
 * Convert v2 session to v1-compatible shape for the existing client.
 * Client expects: session.scene, session.scenario, session.persona, session.characters, session.messages
 */
function toClientSession(session: SessionStateV2) {
  return {
    ...session,
    // v1 compat: scene = worldState mapped to old shape
    scene: {
      sessionId: session.worldState.sessionId,
      scenarioId: session.worldState.scenarioId,
      locationId: session.worldState.locationId,
      backgroundId: session.worldState.backgroundId,
      activeSpeakerId: session.worldState.recentSpeakerIds[0] ?? null,
      tension: session.worldState.tension,
      danger: session.worldState.danger,
      turnNumber: session.worldState.turnNumber,
      hasEnteredScene: session.worldState.hasEnteredScene,
      recentSpeakerIds: session.worldState.recentSpeakerIds,
      relationships: Object.fromEntries(
        Object.entries(session.worldState.characterStates).map(([id, s]) => [id, s.relationshipToUser]),
      ),
    },
    // v1 compat: scenario card
    scenario: {
      id: session.scenarioPackId,
      title: session.title,
      subtitle: "",
      description: "",
      spaceRules: [],
      chatRules: [],
      toneRules: [],
      hardNos: [],
      backgroundIds: [],
      initialLocationId: session.worldState.locationId,
      initialBackgroundId: session.worldState.backgroundId,
      interventionPrompt: "",
      openingBeats: [],
    },
    // v1 compat: persona
    persona: {
      ...session.persona,
      role: "",
      mbti: "unspecified",
      relationshipTags: [],
    },
    // v1 compat: characters mapped to old shape
    characters: session.characters.map((c) => ({
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      role: c.role,
      profileKind: c.profileKind,
      anonymousLabel: c.anonymousLabel,
      revealed: false,
      provider: "dry-run" as const,
      model: `dry-run/${c.id}`,
      mbti: c.mbti,
      ocean: c.ocean,
      systemPrompt: c.systemPrompt,
      relationshipTags: [],
    })),
  };
}
