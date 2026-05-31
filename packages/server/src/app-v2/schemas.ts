import { z } from "zod";

export const modelProviderIdSchema = z.enum(["nanogpt", "openrouter", "chatgpt"]);

export const modelConnectionSchema = z.object({
  providerId: modelProviderIdSchema,
  apiKey: z.string().trim().optional().default(""),
  model: z.string().trim().min(1),
  baseUrl: z.string().trim().url().optional(),
});

export const oceanSchema = z.object({
  openness: z.number().min(0).max(100),
  conscientiousness: z.number().min(0).max(100),
  extraversion: z.number().min(0).max(100),
  agreeableness: z.number().min(0).max(100),
  neuroticism: z.number().min(0).max(100),
});

export const advisorHandoutSchema = z.object({
  secret: z.string().trim().max(2000).optional(),
  desire: z.string().trim().max(1000).optional(),
  objective: z.string().trim().max(1000).optional(),
  initialRelationshipToUser: z.number().min(-10).max(10).optional(),
  surfacePersonality: z.array(z.string().trim().min(1).max(100)).max(12).optional(),
  fear: z.string().trim().max(500).optional(),
  behaviorRules: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
});

export const advisorDraftSchema = z.object({
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

export const personaDraftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shortName: z.string().trim().min(1).max(80).optional(),
  role: z.string().trim().min(1).max(800),
  relationshipTags: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

export const createSessionBodySchema = z.object({
  scenarioPackId: z.string().trim().min(1).max(120),
  persona: z.object({
    name: z.string().trim().max(80).default("{{유저}}"),
  }).optional(),
  advisors: z.array(advisorDraftSchema).min(1).max(4).optional(),
  connections: z.record(z.string(), modelConnectionSchema).optional(),
});

export const personaMakerBodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  connection: modelConnectionSchema.optional(),
});

export const advisorMakerBodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  count: z.number().int().min(1).max(4).default(2),
  connection: modelConnectionSchema.optional(),
});

export const advanceBodySchema = z.object({
  content: z.string().trim().min(1).max(4000),
  inputMode: z.enum(["chat", "action", "whisper"]).optional(),
  connections: z.record(z.string(), modelConnectionSchema).optional(),
});

export const rerollBodySchema = z.object({
  inputMode: z.enum(["chat", "action", "whisper"]).optional(),
  connections: z.record(z.string(), modelConnectionSchema).optional(),
}).optional().default({});

export type AdvisorDraftInput = z.infer<typeof advisorDraftSchema>;
export type ModelConnectionInput = z.infer<typeof modelConnectionSchema>;
