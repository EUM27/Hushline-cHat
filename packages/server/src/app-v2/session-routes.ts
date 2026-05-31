import type { Hono } from "hono";
import { resolve } from "node:path";
import type {
  ModelConnection,
  ScenarioPack,
  SessionStateV2,
  TurnCheckpoint,
  TurnMessage,
  TurnResultV2,
  WorldState,
} from "@hushline/shared";
import { loadScenarioPack, createInitialWorldState, runTurnV2, rollbackTurn } from "../engine-v2/index.js";
import type { SessionStoreV2 } from "../store/sqlite-store-v2.js";
import { applyAdvisorDrafts, packWithSessionCharacters } from "./advisor-drafts.js";
import { advanceBodySchema, createSessionBodySchema, rerollBodySchema } from "./schemas.js";
import { toClientSession } from "./session-presenter.js";
import { resolveUserLabel } from "./utils.js";

const MAX_TURN_CHECKPOINTS = 50;

export interface RegisterSessionRoutesOptions {
  store: SessionStoreV2;
  scenariosDir: string;
}

export function registerSessionRoutes(app: Hono, options: RegisterSessionRoutesOptions) {
  const { store, scenariosDir } = options;

  const loadClientScenarioPack = (session: SessionStateV2): ScenarioPack | undefined => {
    const result = loadScenarioPack(resolve(scenariosDir, session.scenarioPackId));
    return result.success ? result.pack : undefined;
  };

  app.post("/api/v2/sessions", async (context) => {
    const parsed = createSessionBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Invalid session request", details: parsed.error.issues }, 400);
    }

    const { scenarioPackId, persona, advisors } = parsed.data;
    const packResult = loadScenarioPack(resolve(scenariosDir, scenarioPackId));

    if (!packResult.success) {
      return context.json({ error: "Scenario pack failed to load", details: packResult.errors }, 400);
    }

    const pack = applyAdvisorDrafts(packResult.pack, advisors);
    const sessionId = crypto.randomUUID();
    const worldState = createInitialWorldState(sessionId, pack);
    const handouts: SessionStateV2["handouts"] = {};

    for (const charDef of pack.characters) {
      handouts[charDef.id] = {
        characterId: charDef.id,
        secret: charDef.handout.secret,
        desire: charDef.handout.desire,
        objective: charDef.handout.objective,
        relationshipToUser: charDef.handout.initialRelationshipToUser,
        knownFacts: [],
        myRelationships: worldState.relationshipGraph.filter((edge) => edge.sourceId === charDef.id),
        autonomy: charDef.autonomy,
      };
    }

    const personaName = persona?.name ?? "{{유저}}";
    const openingMessages: TurnMessage[] = pack.scenarioCard.openingBeats.map((beat) => ({
      id: crypto.randomUUID(),
      sessionId,
      role: beat.role,
      content: beat.content,
      speakerKind: beat.speakerKind,
      speakerLabel: resolveUserLabel(beat.speakerLabel, personaName),
      isOpeningBeat: true,
      createdAt: new Date().toISOString(),
    }));

    const session: SessionStateV2 = {
      id: sessionId,
      scenarioPackId,
      title: pack.manifest.title,
      persona: {
        id: "user",
        name: personaName,
        shortName: personaName,
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

  app.get("/api/v2/sessions/:id", (context) => {
    const session = store.getSession(context.req.param("id"));
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }
    return context.json({ session: toClientSession(session, loadClientScenarioPack(session)) });
  });

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

    const nextSession: SessionStateV2 = {
      ...session,
      worldState: turnResult.worldState,
      messages: [...session.messages, ...turnResult.messages],
      turnCheckpoints: appendTurnCheckpoint(
        session.turnCheckpoints ?? [],
        createTurnCheckpoint(session.worldState, turnResult),
      ),
      updatedAt: new Date().toISOString(),
    };
    store.saveSession(nextSession);

    return context.json({
      session: toClientSession(nextSession, runtimePack),
      turn: {
        messages: turnResult.messages,
        directorOutput: turnResult.directorOutput,
        boundaryReport: turnResult.boundaryReport,
        stateLaw: turnResult.stateLaw,
        caseRuntime: turnResult.caseRuntime,
      },
    });
  });

  app.post("/api/v2/sessions/:id/reroll", async (context) => {
    const session = store.getSession(context.req.param("id"));
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }

    const parsed = rerollBodySchema.safeParse(await context.req.json().catch(() => ({})));
    const connections = parsed.success && parsed.data.connections
      ? (parsed.data.connections as Record<string, ModelConnection>)
      : undefined;
    const inputMode = parsed.success ? parsed.data.inputMode : undefined;

    const lastUserIndex = findLastIndex(session.messages, (message) => message.role === "user");
    if (lastUserIndex === -1) {
      return context.json({ error: "No user message to reroll" }, 400);
    }

    const lastUserMessage = session.messages[lastUserIndex]!;
    const checkpointMatch = findCheckpointForUserMessage(session.turnCheckpoints ?? [], lastUserMessage.id);
    const rolledBackMessages = session.messages.slice(0, lastUserIndex);
    const rolledBackSession: SessionStateV2 = {
      ...session,
      messages: rolledBackMessages,
      worldState: checkpointMatch?.checkpoint.beforeWorldState ?? rollbackTurn(session.worldState),
      turnCheckpoints: checkpointMatch
        ? (session.turnCheckpoints ?? []).slice(0, checkpointMatch.index)
        : (session.turnCheckpoints ?? []).slice(0, -1),
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
      turnCheckpoints: appendTurnCheckpoint(
        rolledBackSession.turnCheckpoints ?? [],
        createTurnCheckpoint(rolledBackSession.worldState, turnResult),
      ),
      updatedAt: new Date().toISOString(),
    };
    store.saveSession(nextSession);

    return context.json({
      session: toClientSession(nextSession, runtimePack),
      turn: {
        messages: turnResult.messages,
        directorOutput: turnResult.directorOutput,
        boundaryReport: turnResult.boundaryReport,
        stateLaw: turnResult.stateLaw,
        caseRuntime: turnResult.caseRuntime,
      },
    });
  });

  app.post("/api/v2/sessions/:id/undo", async (context) => {
    const session = store.getSession(context.req.param("id"));
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }

    const lastUserIndex = findLastIndex(session.messages, (message) => message.role === "user");
    if (lastUserIndex === -1) {
      return context.json({ error: "No messages to undo" }, 400);
    }

    const lastUserMessage = session.messages[lastUserIndex]!;
    const checkpointMatch = findCheckpointForUserMessage(session.turnCheckpoints ?? [], lastUserMessage.id);
    const nextSession: SessionStateV2 = {
      ...session,
      messages: session.messages.slice(0, lastUserIndex),
      worldState: checkpointMatch?.checkpoint.beforeWorldState ?? rollbackTurn(session.worldState),
      turnCheckpoints: checkpointMatch
        ? (session.turnCheckpoints ?? []).slice(0, checkpointMatch.index)
        : (session.turnCheckpoints ?? []).slice(0, -1),
      updatedAt: new Date().toISOString(),
    };
    store.saveSession(nextSession);

    return context.json({ session: toClientSession(nextSession, loadClientScenarioPack(nextSession)) });
  });
}

function findLastIndex<T>(array: T[], predicate: (item: T) => boolean): number {
  for (let index = array.length - 1; index >= 0; index--) {
    if (predicate(array[index]!)) return index;
  }
  return -1;
}

function createTurnCheckpoint(beforeWorldState: WorldState, turnResult: TurnResultV2): TurnCheckpoint | null {
  const userMessage = turnResult.messages.find((message) => message.role === "user");
  if (!userMessage) {
    return null;
  }

  return {
    turnNumber: turnResult.worldState.turnNumber,
    beforeWorldState,
    afterWorldState: turnResult.worldState,
    userMessageId: userMessage.id,
    generatedMessageIds: turnResult.messages
      .filter((message) => message.id !== userMessage.id)
      .map((message) => message.id),
    createdAt: new Date().toISOString(),
  };
}

function appendTurnCheckpoint(
  checkpoints: TurnCheckpoint[],
  checkpoint: TurnCheckpoint | null,
): TurnCheckpoint[] {
  if (!checkpoint) {
    return checkpoints;
  }
  return [...checkpoints, checkpoint].slice(-MAX_TURN_CHECKPOINTS);
}

function findCheckpointForUserMessage(
  checkpoints: TurnCheckpoint[],
  userMessageId: string,
): { checkpoint: TurnCheckpoint; index: number } | null {
  for (let index = checkpoints.length - 1; index >= 0; index -= 1) {
    const checkpoint = checkpoints[index]!;
    if (checkpoint.userMessageId === userMessageId) {
      return { checkpoint, index };
    }
  }
  return null;
}
