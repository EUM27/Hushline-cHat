import { z } from "zod";
import { characterCardSourceMetadataSchema } from "../engine-v2/schemas.js";

const MAX_IMPORTED_CHARACTER_PROMPT_LENGTH = 100_000;

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

export const characterOverrideSchema = z.object({
  targetId: z.string().trim().min(1).max(120),
  character: z.object({
    id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    shortName: z.string().trim().min(1).max(80),
    role: z.string().trim().min(1).max(1000),
    profileKind: z.enum(["advisor-slot", "named-actor"]).optional(),
    anonymousLabel: z.string().trim().min(1).max(80).optional(),
    mbti: z.string().trim().min(1).max(20),
    ocean: oceanSchema,
    autonomy: z.number().min(0).max(1),
    systemPrompt: z.string().trim().min(1).max(MAX_IMPORTED_CHARACTER_PROMPT_LENGTH),
    relationshipTags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    handout: z.object({
      secret: z.string().trim().max(2000),
      desire: z.string().trim().max(1000),
      objective: z.string().trim().max(1000),
      initialRelationshipToUser: z.number().min(-10).max(10),
      surfacePersonality: z.array(z.string().trim().min(1).max(100)).max(12).optional(),
      fear: z.string().trim().max(500).optional(),
      behaviorRules: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
    }),
    relationships: z.array(z.object({
      targetId: z.string().trim().min(1).max(120),
      descriptor: z.string().trim().min(1).max(300),
      intensity: z.number().min(-10).max(10),
    })).max(50),
    spriteSetId: z.string().trim().min(1).max(120).optional(),
    avatarId: z.string().trim().min(1).max(120).optional(),
  }),
});

export const reusablePersonaProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shortName: z.string().trim().min(1).max(80).optional(),
  role: z.string().trim().max(800).optional(),
  description: z.string().trim().max(2000).optional(),
  appearance: z.string().trim().max(2000).optional(),
  portraitUrl: z.string().trim().max(2048).optional(),
  relationshipTags: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

export const savePersonaProfileBodySchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  persona: reusablePersonaProfileSchema,
});

export const saveCharacterCardBodySchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  sourceFileName: z.string().trim().max(200).optional(),
  sourceMetadata: characterCardSourceMetadataSchema.optional(),
  character: characterOverrideSchema.shape.character,
});

export const personaDraftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shortName: z.string().trim().min(1).max(80).optional(),
  role: z.string().trim().min(1).max(800),
  description: z.string().trim().max(2000).optional(),
  appearance: z.string().trim().max(2000).optional(),
  relationshipTags: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

export const createSessionBodySchema = z.object({
  scenarioPackId: z.string().trim().min(1).max(120),
  persona: z.object({
    name: z.string().trim().max(80).default("{{유저}}"),
    shortName: z.string().trim().max(80).optional(),
    role: z.string().trim().max(800).optional(),
    description: z.string().trim().max(2000).optional(),
    appearance: z.string().trim().max(2000).optional(),
    relationshipTags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  }).optional(),
  advisors: z.array(advisorDraftSchema).min(1).max(4).optional(),
  characterOverrides: z.array(characterOverrideSchema).max(8).optional(),
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

// base64 for png, raw JSON text for json. ~8MB base64 ceiling.
export const MAX_CARD_DATA_LENGTH = 8 * 1024 * 1024;

export const cardImportBodySchema = z.object({
  kind: z.enum(["png", "json"]),
  data: z.string().min(1),
  fileName: z.string().trim().max(200).optional(),
});

export type AdvisorDraftInput = z.infer<typeof advisorDraftSchema>;
export type CharacterOverrideInput = z.infer<typeof characterOverrideSchema>;
export type ModelConnectionInput = z.infer<typeof modelConnectionSchema>;
export type ReusablePersonaProfileInput = z.infer<typeof reusablePersonaProfileSchema>;
export type SaveCharacterCardInput = z.infer<typeof saveCharacterCardBodySchema>;
export type SavePersonaProfileInput = z.infer<typeof savePersonaProfileBodySchema>;
