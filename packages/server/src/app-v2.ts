// ──────────────────────────────────────────────
// Engine v2 — API Routes
// ──────────────────────────────────────────────
// Mounted alongside v1 routes during migration.
// All v2 endpoints live under /api/v2/
// ──────────────────────────────────────────────

import { Hono } from "hono";
import { z } from "zod";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdvisorDraft,
  CharacterDefinition,
  CharacterHandoutDefinition,
  ModelConnection,
  PersonaDraft,
  ScenarioPack,
  SessionStateV2,
  TurnMessage,
} from "@hushline/shared";
import { loadScenarioPack, listScenarioPacks, createInitialWorldState, runTurnV2, rollbackTurn } from "./engine-v2/index.js";
import { completeWithConnection, isConnectionReady } from "./providers/adapters/index.js";
import { listModelsForProvider, providerProfiles } from "./providers/adapters/index.js";
import { assetManifest } from "./assets.js";
import { registerOpenAiOAuthRoutes } from "./providers/openai-oauth.js";
import { createSqliteStoreV2, type SessionStoreV2 } from "./store/sqlite-store-v2.js";

// ── Schemas ──

const modelProviderIdSchema = z.enum(["nanogpt", "openrouter", "chatgpt"]);

const modelConnectionSchema = z.object({
  providerId: modelProviderIdSchema,
  apiKey: z.string().trim().optional().default(""),
  model: z.string().trim().min(1),
  baseUrl: z.string().trim().url().optional(),
});

const oceanSchema = z.object({
  openness: z.number().min(0).max(100),
  conscientiousness: z.number().min(0).max(100),
  extraversion: z.number().min(0).max(100),
  agreeableness: z.number().min(0).max(100),
  neuroticism: z.number().min(0).max(100),
});

const advisorHandoutSchema = z.object({
  secret: z.string().trim().max(2000).optional(),
  desire: z.string().trim().max(1000).optional(),
  objective: z.string().trim().max(1000).optional(),
  initialRelationshipToUser: z.number().min(-10).max(10).optional(),
  surfacePersonality: z.array(z.string().trim().min(1).max(100)).max(12).optional(),
  fear: z.string().trim().max(500).optional(),
  behaviorRules: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
});

const advisorDraftSchema = z.object({
  id: z.string().trim().min(1).max(80),
  anonymousLabel: z.string().trim().min(1).max(80),
  role: z.string().trim().min(1).max(500),
  systemPrompt: z.string().trim().min(1).max(2500),
  mbti: z.string().trim().min(1).max(20),
  ocean: oceanSchema,
  relationshipTags: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  autonomy: z.number().min(0).max(1).optional(),
  handout: advisorHandoutSchema.optional(),
});

const personaDraftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shortName: z.string().trim().min(1).max(80).optional(),
  role: z.string().trim().min(1).max(800),
  relationshipTags: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

const createSessionBodySchema = z.object({
  scenarioPackId: z.string().trim().min(1).max(120),
  persona: z.object({
    name: z.string().trim().max(80).default("{{유저}}"),
  }).optional(),
  advisors: z.array(advisorDraftSchema).min(1).max(4).optional(),
  connections: z.record(z.string(), modelConnectionSchema).optional(),
});

const personaMakerBodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  connection: modelConnectionSchema.optional(),
});

const advisorMakerBodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  count: z.number().int().min(1).max(4).default(2),
  connection: modelConnectionSchema.optional(),
});

const advanceBodySchema = z.object({
  content: z.string().trim().min(1).max(4000),
  inputMode: z.enum(["chat", "action", "whisper"]).optional(),
  connections: z.record(z.string(), modelConnectionSchema).optional(),
});

type AdvisorDraftInput = z.infer<typeof advisorDraftSchema>;
type ModelConnectionInput = z.infer<typeof modelConnectionSchema>;

// ── App ──

export interface CreateAppV2Options {
  store?: SessionStoreV2;
  scenariosDir?: string;
}

export function createAppV2(options: CreateAppV2Options = {}) {
  const store = options.store ?? createSqliteStoreV2();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const scenariosDir = options.scenariosDir ?? resolve(__dirname, "../scenarios");
  const app = new Hono();

  const loadClientScenarioPack = (session: SessionStateV2): ScenarioPack | undefined => {
    const result = loadScenarioPack(resolve(scenariosDir, session.scenarioPackId));
    return result.success ? result.pack : undefined;
  };

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

  // ── Generate a user persona draft for onboarding ──
  app.post("/api/v2/persona-maker/generate", async (context) => {
    const parsed = personaMakerBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Invalid persona maker request", details: parsed.error.issues }, 400);
    }

    const result = await generatePersonaDraft(parsed.data.prompt, normalizeModelConnection(parsed.data.connection));
    return context.json(result);
  });

  // ── Generate advisor drafts for onboarding ──
  app.post("/api/v2/advisor-maker/generate", async (context) => {
    const parsed = advisorMakerBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Invalid advisor maker request", details: parsed.error.issues }, 400);
    }

    const result = await generateAdvisorDrafts(
      parsed.data.prompt,
      parsed.data.count,
      normalizeModelConnection(parsed.data.connection),
    );
    return context.json(result);
  });

  // ── Create session ──
  app.post("/api/v2/sessions", async (context) => {
    const parsed = createSessionBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Invalid session request", details: parsed.error.issues }, 400);
    }

    const { scenarioPackId, persona, advisors } = parsed.data;
    const packDir = resolve(scenariosDir, scenarioPackId);
    const packResult = loadScenarioPack(packDir);

    if (!packResult.success) {
      return context.json({ error: "Scenario pack failed to load", details: packResult.errors }, 400);
    }

    const pack = applyAdvisorDrafts(packResult.pack, advisors);
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
    return context.json({ session: toClientSession(session, pack) }, 201);
  });

  // ── Get session ──
  app.get("/api/v2/sessions/:id", (context) => {
    const session = store.getSession(context.req.param("id"));
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }
    return context.json({ session: toClientSession(session, loadClientScenarioPack(session)) });
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

    const packResult = loadScenarioPack(resolve(scenariosDir, session.scenarioPackId));
    if (!packResult.success) {
      return context.json({ error: "Scenario pack failed to load", details: packResult.errors }, 400);
    }

    const runtimePack = packWithSessionCharacters(packResult.pack, session);
    const turnResult = await runTurnV2(session, parsed.data.content, {
      ...(parsed.data.connections ? { connections: parsed.data.connections as Record<string, ModelConnection> } : {}),
      ...(parsed.data.inputMode ? { inputMode: parsed.data.inputMode } : {}),
      scenarioPack: runtimePack,
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
      session: toClientSession(nextSession, runtimePack),
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

    const packResult = loadScenarioPack(resolve(scenariosDir, session.scenarioPackId));
    if (!packResult.success) {
      return context.json({ error: "Scenario pack failed to load", details: packResult.errors }, 400);
    }

    const runtimePack = packWithSessionCharacters(packResult.pack, rolledBackSession);
    const turnResult = await runTurnV2(rolledBackSession, lastUserMessage.content, {
      ...(connections ? { connections } : {}),
      inputMode: lastUserMessage.inputMode ?? inputMode ?? "chat",
      scenarioPack: runtimePack,
    });

    const nextSession: SessionStateV2 = {
      ...rolledBackSession,
      worldState: turnResult.worldState,
      messages: [...rolledBackMessages, ...turnResult.messages],
      updatedAt: new Date().toISOString(),
    };
    store.saveSession(nextSession);

    return context.json({
      session: toClientSession(nextSession, runtimePack),
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

    return context.json({ session: toClientSession(nextSession, loadClientScenarioPack(nextSession)) });
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

function applyAdvisorDrafts(pack: ScenarioPack, advisorDrafts?: AdvisorDraftInput[]): ScenarioPack {
  if (!advisorDrafts?.length) {
    return pack;
  }

  const characters = pack.characters.map(cloneCharacterDefinition);
  for (const [index, draft] of advisorDrafts.entries()) {
    const matchingIndex = characters.findIndex(
      (character) => character.id === draft.id && character.profileKind === "advisor-slot",
    );
    const fallbackIndex = characters.findIndex(
      (character, characterIndex) => characterIndex >= index && character.profileKind === "advisor-slot",
    );
    const targetIndex = matchingIndex >= 0 ? matchingIndex : fallbackIndex;
    const original = characters[targetIndex];
    if (!original || original.profileKind !== "advisor-slot") {
      continue;
    }
    characters[targetIndex] = advisorDraftToCharacterDefinition(draft, original, targetIndex);
  }

  return { ...pack, characters };
}

function packWithSessionCharacters(pack: ScenarioPack, session: SessionStateV2): ScenarioPack {
  return {
    ...pack,
    characters: session.characters.map(cloneCharacterDefinition),
  };
}

function advisorDraftToCharacterDefinition(
  draft: AdvisorDraftInput,
  original: CharacterDefinition,
  index: number,
): CharacterDefinition {
  const anonymousLabel = nonEmpty(draft.anonymousLabel) ?? original.anonymousLabel ?? `[익명 ${index + 1}]`;
  const relationshipTags = uniqueStrings(["advisor-slot", ...draft.relationshipTags]);
  const next: CharacterDefinition = {
    ...original,
    id: original.id,
    name: anonymousLabel,
    shortName: stripAnonymousBrackets(anonymousLabel) || original.shortName,
    role: nonEmpty(draft.role) ?? original.role,
    profileKind: "advisor-slot",
    anonymousLabel,
    mbti: nonEmpty(draft.mbti) ?? original.mbti,
    ocean: { ...draft.ocean },
    autonomy: draft.autonomy ?? original.autonomy,
    systemPrompt: nonEmpty(draft.systemPrompt) ?? original.systemPrompt,
    relationshipTags,
    handout: buildAdvisorHandout(original.handout, draft),
    relationships: original.relationships.map((relationship) => ({ ...relationship })),
  };
  return next;
}

function buildAdvisorHandout(
  original: CharacterHandoutDefinition,
  draft: AdvisorDraftInput,
): CharacterHandoutDefinition {
  const handout = draft.handout;
  const next: CharacterHandoutDefinition = {
    secret: nonEmpty(handout?.secret) ?? original.secret,
    desire: nonEmpty(handout?.desire) ?? original.desire,
    objective: nonEmpty(handout?.objective) ?? nonEmpty(draft.role) ?? original.objective,
    initialRelationshipToUser: clamp(handout?.initialRelationshipToUser ?? original.initialRelationshipToUser, -10, 10),
  };

  const surfacePersonality = cleanStringArray(handout?.surfacePersonality);
  if (surfacePersonality.length > 0) {
    next.surfacePersonality = surfacePersonality;
  } else if (draft.relationshipTags.length > 0) {
    next.surfacePersonality = [...draft.relationshipTags];
  } else if (original.surfacePersonality) {
    next.surfacePersonality = [...original.surfacePersonality];
  }

  const fear = nonEmpty(handout?.fear);
  if (fear) {
    next.fear = fear;
  } else if (original.fear) {
    next.fear = original.fear;
  }

  const behaviorRules = cleanStringArray(handout?.behaviorRules);
  if (behaviorRules.length > 0) {
    next.behaviorRules = behaviorRules;
  } else if (original.behaviorRules) {
    next.behaviorRules = [...original.behaviorRules];
  }

  return next;
}

function cloneCharacterDefinition(character: CharacterDefinition): CharacterDefinition {
  const next: CharacterDefinition = {
    ...character,
    ocean: { ...character.ocean },
    handout: cloneHandoutDefinition(character.handout),
    relationships: character.relationships.map((relationship) => ({ ...relationship })),
  };
  if (character.relationshipTags) {
    next.relationshipTags = [...character.relationshipTags];
  }
  return next;
}

function cloneHandoutDefinition(handout: CharacterHandoutDefinition): CharacterHandoutDefinition {
  const next: CharacterHandoutDefinition = {
    secret: handout.secret,
    desire: handout.desire,
    objective: handout.objective,
    initialRelationshipToUser: handout.initialRelationshipToUser,
  };
  if (handout.surfacePersonality) {
    next.surfacePersonality = [...handout.surfacePersonality];
  }
  if (handout.fear) {
    next.fear = handout.fear;
  }
  if (handout.behaviorRules) {
    next.behaviorRules = [...handout.behaviorRules];
  }
  return next;
}

async function generatePersonaDraft(
  prompt: string,
  connection?: ModelConnection,
): Promise<{ persona: PersonaDraft; source: "api" | "fallback"; error?: string }> {
  const fallback = createFallbackPersonaDraft(prompt);
  if (!hasUsableConnection(connection)) {
    return { persona: fallback, source: "fallback" };
  }

  try {
    const raw = await completeWithConnection({
      connection,
      systemPrompt: PERSONA_MAKER_SYSTEM_PROMPT,
      messages: [makeMakerMessage(buildPersonaMakerPrompt(prompt))],
    });
    const parsed = parseJsonObject(raw);
    const candidate = getNestedObject(parsed, "persona") ?? parsed;
    const result = personaDraftSchema.safeParse(candidate);
    if (!result.success) {
      return { persona: fallback, source: "fallback", error: "Persona maker returned invalid JSON shape." };
    }
    return {
      persona: {
        name: result.data.name,
        ...(result.data.shortName ? { shortName: result.data.shortName } : {}),
        role: result.data.role,
        relationshipTags: uniqueStrings(result.data.relationshipTags),
      },
      source: "api",
    };
  } catch (reason: unknown) {
    return {
      persona: fallback,
      source: "fallback",
      error: reason instanceof Error ? reason.message : "Persona maker failed.",
    };
  }
}

async function generateAdvisorDrafts(
  prompt: string,
  count: number,
  connection?: ModelConnection,
): Promise<{ advisors: AdvisorDraft[]; source: "api" | "fallback"; error?: string }> {
  const fallback = createFallbackAdvisorDrafts(prompt, count);
  if (!hasUsableConnection(connection)) {
    return { advisors: fallback, source: "fallback" };
  }

  try {
    const raw = await completeWithConnection({
      connection,
      systemPrompt: ADVISOR_MAKER_SYSTEM_PROMPT,
      messages: [makeMakerMessage(buildAdvisorMakerPrompt(prompt, count))],
    });
    const parsed = parseJsonObject(raw);
    const candidate = Array.isArray(parsed) ? parsed : getNestedArray(parsed, "advisors");
    const result = z.array(advisorDraftSchema).min(1).max(4).safeParse(candidate);
    if (!result.success) {
      return { advisors: fallback, source: "fallback", error: "Advisor maker returned invalid JSON shape." };
    }
    return {
      advisors: result.data.slice(0, count).map((draft, index) => normalizeAdvisorDraft(draft, index)),
      source: "api",
    };
  } catch (reason: unknown) {
    return {
      advisors: fallback,
      source: "fallback",
      error: reason instanceof Error ? reason.message : "Advisor maker failed.",
    };
  }
}

/**
 * Convert v2 session to v1-compatible shape for the existing client.
 * Client expects: session.scene, session.scenario, session.persona, session.characters, session.messages
 */
function toClientSession(session: SessionStateV2, scenarioPack?: ScenarioPack) {
  const scenarioCard = scenarioPack?.scenarioCard;

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
    // v1 compat: scenario card, preserving safe public scenario pack fields when available
    scenario: {
      id: session.scenarioPackId,
      title: scenarioCard?.title ?? session.title,
      subtitle: scenarioCard?.subtitle ?? "",
      description: scenarioCard?.description ?? "",
      spaceRules: scenarioCard?.spaceRules ?? [],
      chatRules: scenarioCard?.chatRules ?? [],
      toneRules: scenarioCard?.toneRules ?? [],
      hardNos: scenarioCard?.hardNos ?? [],
      backgroundIds: scenarioCard?.backgroundIds ?? [],
      initialLocationId: scenarioCard?.initialLocationId ?? session.worldState.locationId,
      initialBackgroundId: scenarioCard?.initialBackgroundId ?? session.worldState.backgroundId,
      initialSceneMode: scenarioCard?.initialSceneMode ?? session.worldState.sceneMode,
      uiMode: scenarioPack?.manifest.uiMode ?? (session.worldState.sceneMode === "messenger" ? "messenger-first" : "scene-first"),
      interventionPrompt: scenarioCard?.interventionPrompt ?? "",
      openingBeats: scenarioCard?.openingBeats ?? [],
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
      relationshipTags: c.relationshipTags ?? c.handout.surfacePersonality ?? [],
    })),
  };
}

const PERSONA_MAKER_SYSTEM_PROMPT = [
  "You generate Hushline onboarding persona drafts.",
  "Return JSON only. No markdown.",
  "The persona is the user's playable stance, not an NPC card.",
  "Keep fields compact and writer-facing.",
].join("\n");

const ADVISOR_MAKER_SYSTEM_PROMPT = [
  "You generate Hushline anonymous advisor drafts.",
  "Return JSON only. No markdown.",
  "Each advisor is an agent slot for the group-chat survival engine.",
  "Do not create full SillyTavern or Marinara character cards.",
  "Keep secrets/objectives playable and useful for runtime handouts.",
].join("\n");

function buildPersonaMakerPrompt(prompt: string): string {
  return [
    "Create one Korean persona draft for this playable user concept.",
    "",
    "Required JSON shape:",
    "{",
    '  "persona": {',
    '    "name": "short display name",',
    '    "shortName": "optional shorter label",',
    '    "role": "one or two sentences about stance and narrative pressure",',
    '    "relationshipTags": ["user-persona", "scenario-participant", "..."]',
    "  }",
    "}",
    "",
    `User concept: ${prompt}`,
  ].join("\n");
}

function buildAdvisorMakerPrompt(prompt: string, count: number): string {
  return [
    `Create ${count} Korean anonymous advisor drafts for Hushline v2.`,
    "",
    "Required JSON shape:",
    "{",
    '  "advisors": [',
    "    {",
    '      "id": "advisor-1",',
    '      "anonymousLabel": "[익명 1]",',
    '      "role": "runtime role in one sentence",',
    '      "systemPrompt": "voice and behavioral contract",',
    '      "mbti": "ISTP",',
    '      "ocean": { "openness": 50, "conscientiousness": 70, "extraversion": 35, "agreeableness": 45, "neuroticism": 65 },',
    '      "relationshipTags": ["advisor-slot", "..."],',
    '      "autonomy": 0.6,',
    '      "handout": {',
    '        "secret": "private knowledge",',
    '        "desire": "private want",',
    '        "objective": "current runtime objective",',
    '        "initialRelationshipToUser": 1,',
    '        "surfacePersonality": ["short trait"],',
    '        "fear": "private fear",',
    '        "behaviorRules": ["short rule"]',
    "      }",
    "    }",
    "  ]",
    "}",
    "",
    `Advisor concept: ${prompt}`,
  ].join("\n");
}

function createFallbackPersonaDraft(prompt: string): PersonaDraft {
  const name = inferPersonaName(prompt);
  return {
    name,
    shortName: name,
    role: `${truncateForPrompt(prompt, 120)}. 이상공간 단톡방에 끌려온 참여자이며, 사람을 버리지 않으면서도 규칙의 허점을 확인하려 한다.`,
    relationshipTags: ["user-persona", "scenario-participant", "scene-driver"],
  };
}

function createFallbackAdvisorDrafts(prompt: string, count: number): AdvisorDraft[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `advisor-${index + 1}`;
    const label = index === 0 ? "[익명 1]" : `[익명 ${index + 8}]`;
    const role = `${truncateForPrompt(prompt, 120)}. 단톡방에서 위험 신호를 먼저 짚는 익명 조력자.`;
    const ocean = index === 0
      ? {
          openness: 52,
          conscientiousness: 76,
          extraversion: 34,
          agreeableness: 46,
          neuroticism: 68,
        }
      : {
          openness: 68,
          conscientiousness: 62,
          extraversion: 28,
          agreeableness: 70,
          neuroticism: 78,
        };

    return {
      id,
      anonymousLabel: label,
      role,
      systemPrompt: `너는 ${label}로 보이는 조언자다. ${truncateForPrompt(prompt, 120)}라는 관점으로 짧게 말하고, 감정보다 위험 규칙과 관찰 단서를 먼저 꺼낸다.`,
      mbti: index === 0 ? "ISTP" : "INFJ",
      ocean,
      relationshipTags: uniqueStrings([
        "advisor-slot",
        index === 0 ? "risk-first" : "nervous-observer",
        "generated-draft",
      ]),
      autonomy: index === 0 ? 0.55 : 0.65,
      handout: {
        secret: `${truncateForPrompt(prompt, 120)}와 연결된 위험 징후를 이전 턴 또는 이전 루프에서 일부 목격했다.`,
        desire: "사용자가 첫 선택에서 치명적인 실수를 피하게 만들고 싶다.",
        objective: `${truncateForPrompt(prompt, 120)} 단서를 확인하게 만들고, 사용자가 성급하게 이동하지 않게 붙잡는다.`,
        initialRelationshipToUser: index === 0 ? 1 : 2,
        surfacePersonality: [index === 0 ? "경고가 빠르다" : "불안하지만 관찰력이 좋다"],
        fear: "사용자가 규칙을 검증하기 전에 방장이나 공간의 유도에 반응하는 것",
        behaviorRules: ["대사는 짧게", "위험 규칙 우선", "다른 인물의 대사를 대신 쓰지 않음"],
      },
    };
  });
}

function normalizeAdvisorDraft(draft: AdvisorDraftInput, index: number): AdvisorDraft {
  const normalized: AdvisorDraft = {
    id: draft.id || `advisor-${index + 1}`,
    anonymousLabel: draft.anonymousLabel || `[익명 ${index + 1}]`,
    role: draft.role,
    systemPrompt: draft.systemPrompt,
    mbti: draft.mbti || "unspecified",
    ocean: { ...draft.ocean },
    relationshipTags: uniqueStrings(["advisor-slot", ...draft.relationshipTags]),
  };
  if (draft.autonomy !== undefined) {
    normalized.autonomy = draft.autonomy;
  }
  if (draft.handout) {
    normalized.handout = normalizePartialHandout(draft.handout);
  }
  return normalized;
}

function normalizePartialHandout(handout: NonNullable<AdvisorDraftInput["handout"]>): Partial<CharacterHandoutDefinition> {
  const normalized: Partial<CharacterHandoutDefinition> = {};
  const secret = nonEmpty(handout.secret);
  const desire = nonEmpty(handout.desire);
  const objective = nonEmpty(handout.objective);
  const fear = nonEmpty(handout.fear);
  if (secret) normalized.secret = secret;
  if (desire) normalized.desire = desire;
  if (objective) normalized.objective = objective;
  if (handout.initialRelationshipToUser !== undefined) {
    normalized.initialRelationshipToUser = clamp(handout.initialRelationshipToUser, -10, 10);
  }
  const surfacePersonality = cleanStringArray(handout.surfacePersonality);
  if (surfacePersonality.length > 0) {
    normalized.surfacePersonality = surfacePersonality;
  }
  if (fear) {
    normalized.fear = fear;
  }
  const behaviorRules = cleanStringArray(handout.behaviorRules);
  if (behaviorRules.length > 0) {
    normalized.behaviorRules = behaviorRules;
  }
  return normalized;
}

function normalizeModelConnection(connection?: ModelConnectionInput): ModelConnection | undefined {
  if (!connection) {
    return undefined;
  }
  const normalized: ModelConnection = {
    providerId: connection.providerId,
    apiKey: connection.apiKey,
    model: connection.model,
  };
  if (connection.baseUrl) {
    normalized.baseUrl = connection.baseUrl;
  }
  return normalized;
}

function makeMakerMessage(content: string) {
  return {
    id: crypto.randomUUID(),
    sessionId: "draft-maker",
    role: "user" as const,
    content,
    createdAt: new Date().toISOString(),
  };
}

function hasUsableConnection(connection?: ModelConnection): connection is ModelConnection {
  return isConnectionReady(connection);
}

function parseJsonObject(raw: string): unknown {
  const candidate = extractJsonCandidate(raw);
  return JSON.parse(candidate);
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (starts.length === 0) {
    return trimmed;
  }

  const start = Math.min(...starts);
  const objectEnd = trimmed.lastIndexOf("}");
  const arrayEnd = trimmed.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);
  return end > start ? trimmed.slice(start, end + 1) : trimmed.slice(start);
}

function getNestedObject(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function getNestedArray(value: unknown, key: string): unknown {
  const nested = getNestedObject(value, key);
  return Array.isArray(nested) ? nested : undefined;
}

function inferPersonaName(prompt: string): string {
  if (prompt.includes("전학생")) {
    return "전학생";
  }
  if (prompt.includes("선생")) {
    return "선생님";
  }
  if (prompt.includes("작가")) {
    return "작가";
  }
  return "초대자";
}

function stripAnonymousBrackets(label: string): string {
  return label.replace(/^\[/, "").replace(/\]$/, "").trim();
}

function nonEmpty(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanStringArray(values?: string[]): string[] {
  return uniqueStrings((values ?? []).map((value) => value.trim()).filter(Boolean));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function truncateForPrompt(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}...` : trimmed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
