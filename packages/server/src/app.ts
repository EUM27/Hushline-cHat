import { Hono } from "hono";
import { z } from "zod";
import type { ChatMessage, ModelConnection } from "@hushline/shared";
import { assetManifest } from "./assets";
import { runTurn } from "./engine/turn-engine";
import { listModelsForProvider, providerProfiles } from "./providers/adapters";
import { createSqliteStore, type SessionStore } from "./store/sqlite-store";

const messageBodySchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

const modelProviderIdSchema = z.enum(["nanogpt", "openrouter"]);

const modelConnectionSchema = z.object({
  providerId: modelProviderIdSchema,
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1),
  baseUrl: z.string().trim().url().optional(),
});

const advanceBodySchema = messageBodySchema.extend({
  connections: z.record(z.string(), modelConnectionSchema).optional(),
});

const oceanSchema = z.object({
  openness: z.number().min(0).max(100),
  conscientiousness: z.number().min(0).max(100),
  extraversion: z.number().min(0).max(100),
  agreeableness: z.number().min(0).max(100),
  neuroticism: z.number().min(0).max(100),
});

const advisorDraftSchema = z.object({
  id: z.string().trim().min(1).max(80),
  anonymousLabel: z.string().trim().min(1).max(40),
  role: z.string().trim().min(1).max(400),
  systemPrompt: z.string().trim().min(1).max(1200),
  mbti: z.string().trim().min(1).max(20),
  ocean: oceanSchema,
  relationshipTags: z.array(z.string().trim().min(1).max(80)).max(10),
});

const createSessionBodySchema = z
  .object({
    persona: z
      .object({
        name: z.string().trim().max(80).optional(),
      })
      .optional(),
    advisors: z.array(advisorDraftSchema).min(2).max(2).optional(),
  })
  .optional();

const modelListBodySchema = z.object({
  apiKey: z.string().trim().optional(),
});

export interface CreateAppOptions {
  store?: SessionStore;
}

export function createApp(options: CreateAppOptions = {}) {
  const store = options.store ?? createSqliteStore();
  const app = new Hono();

  app.get("/api/health", (context) =>
    context.json({
      ok: true,
      name: "hushline-chat",
    }),
  );

  app.get("/api/assets", (context) => context.json(assetManifest));

  app.get("/api/provider-profiles", (context) =>
    context.json({
      profiles: providerProfiles,
    }),
  );

  app.post("/api/provider-profiles/:providerId/models", async (context) => {
    const providerId = modelProviderIdSchema.safeParse(context.req.param("providerId"));
    if (!providerId.success) {
      return context.json({ error: "Provider not found" }, 404);
    }

    const parsed = modelListBodySchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json({ error: "Invalid model list request" }, 400);
    }

    try {
      const models = await listModelsForProvider(providerId.data, parsed.data.apiKey);
      return context.json({ models });
    } catch (reason: unknown) {
      return context.json(
        {
          error: reason instanceof Error ? reason.message : "Model list request failed",
        },
        502,
      );
    }
  });

  app.post("/api/sessions", async (context) => {
    const parsed = createSessionBodySchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) {
      return context.json({ error: "Invalid session request" }, 400);
    }

    const persona = parsed.data?.persona;
    const advisors = parsed.data?.advisors;
    const session = store.createSession(
      persona || advisors
        ? {
            ...(persona
              ? {
                  persona: {
                    ...(persona.name ? { name: persona.name } : {}),
                  },
                }
              : {}),
            ...(advisors ? { advisors } : {}),
          }
        : undefined,
    );
    return context.json({ session }, 201);
  });

  app.get("/api/sessions/:id", (context) => {
    const session = store.getSession(context.req.param("id"));
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }
    return context.json({ session });
  });

  app.post("/api/sessions/:id/messages", async (context) => {
    const parsed = messageBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Message content is required" }, 400);
    }

    const message = createUserMessage(context.req.param("id"), parsed.data.content);
    const session = store.appendMessage(context.req.param("id"), message);
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }

    return context.json({ session, message }, 201);
  });

  app.post("/api/sessions/:id/advance", async (context) => {
    const session = store.getSession(context.req.param("id"));
    if (!session) {
      return context.json({ error: "Session not found" }, 404);
    }

    const parsed = advanceBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Advance content is required" }, 400);
    }

    const turnOptions = parsed.data.connections
      ? { connections: parsed.data.connections as Record<string, ModelConnection> }
      : {};
    const turn = await runTurn(session, parsed.data.content, turnOptions);
    store.saveSession(turn.state);

    return context.json({
      session: turn.state,
      turn: {
        scene: turn.scene,
        messages: turn.messages,
        directorDecision: turn.directorDecision,
      },
    });
  });

  return app;
}

function createUserMessage(sessionId: string, content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}
