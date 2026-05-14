// ──────────────────────────────────────────────
// Engine v2 — Zod Validation Schemas
// ──────────────────────────────────────────────

import { z } from "zod";

// ── Scenario Manifest ──

export const scenarioGenreSchema = z.enum([
  "horror", "romance", "mystery", "fantasy", "scifi", "slice_of_life", "thriller",
]);

export const scenarioManifestSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(400).default(""),
  genre: scenarioGenreSchema,
  version: z.string().min(1).max(20),
  engineVersion: z.string().min(1).max(30),
  uiMode: z.enum(["messenger-first", "scene-first", "hybrid"]).optional(),
});

// ── Scenario Card ──

export const scenarioOpeningBeatSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["narrator", "system"]),
  speakerKind: z.enum(["scenario-crowd", "room-master", "named-actor"]),
  speakerLabel: z.string().min(1).max(60),
  content: z.string().min(1).max(2000),
  delay: z.number().int().min(0).max(10000).optional(),
});

export const scenarioCardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(400).default(""),
  description: z.string().max(4000).default(""),
  spaceRules: z.array(z.string().max(1000)).default([]),
  chatRules: z.array(z.string().max(1000)).default([]),
  toneRules: z.array(z.string().max(1000)).default([]),
  hardNos: z.array(z.string().max(1000)).default([]),
  backgroundIds: z.array(z.string()).default([]),
  initialLocationId: z.string().min(1),
  initialBackgroundId: z.string().min(1),
  initialSceneMode: z.enum(["messenger", "exploration", "dialogue", "tension", "crisis", "resolution"]).default("messenger"),
  interventionPrompt: z.string().max(500).default(""),
  openingBeats: z.array(scenarioOpeningBeatSchema).default([]),
});

// ── Character Definition ──

export const oceanSchema = z.object({
  openness: z.number().min(0).max(100),
  conscientiousness: z.number().min(0).max(100),
  extraversion: z.number().min(0).max(100),
  agreeableness: z.number().min(0).max(100),
  neuroticism: z.number().min(0).max(100),
});

export const characterHandoutSchema = z.object({
  secret: z.string().max(2000).default(""),
  desire: z.string().max(1000).default(""),
  objective: z.string().max(1000).default(""),
  initialRelationshipToUser: z.number().min(-10).max(10).default(0),
  surfacePersonality: z.array(z.string().max(100)).optional(),
  fear: z.string().max(500).optional(),
  behaviorRules: z.array(z.string().max(300)).optional(),
});

export const characterRelationshipDefSchema = z.object({
  targetId: z.string().min(1),
  descriptor: z.string().min(1).max(100),
  intensity: z.number().min(0).max(10).default(5),
});

export const characterDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  shortName: z.string().min(1).max(40),
  role: z.string().max(400).default(""),
  profileKind: z.enum(["advisor-slot", "named-actor"]).default("advisor-slot"),
  anonymousLabel: z.string().max(40).optional(),
  mbti: z.string().max(20).default("unspecified"),
  ocean: oceanSchema,
  autonomy: z.number().min(0).max(1).default(0.5),
  systemPrompt: z.string().min(1).max(4000),
  handout: characterHandoutSchema,
  relationships: z.array(characterRelationshipDefSchema).default([]),
  spriteSetId: z.string().optional(),
  avatarId: z.string().optional(),
});

// ── Objectives ──

export const objectiveDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  description: z.string().min(1).max(1000),
});

// ── Event Triggers ──

export const eventTriggerSchema = z.object({
  id: z.string().min(1).max(80),
  condition: z.string().min(1).max(1000),
  description: z.string().min(1).max(2000),
  oneShot: z.boolean().default(true),
});

// ── Director Output (for runtime validation) ──

export const directorStateDeltaSchema = z.object({
  tension: z.number().min(-10).max(10).optional(),
  danger: z.number().min(-10).max(10).optional(),
  locationId: z.string().optional(),
  backgroundId: z.string().optional(),
  sceneMode: z.enum(["messenger", "exploration", "dialogue", "tension", "crisis", "resolution"]).optional(),
});

export const directorSubObjectiveUpdateSchema = z.object({
  action: z.enum(["create", "progress", "complete", "fail"]),
  id: z.string().optional(),
  description: z.string().optional(),
  deliveredVia: z.enum(["dialogue", "narrator", "event"]).optional(),
});

export const directorRelationshipUpdateSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  descriptor: z.string().min(1).max(100),
  intensityDelta: z.number().min(-10).max(10),
});

export const directorDirectiveSchema = z.object({
  effect: z.enum(["fade_to_black", "fade_from_black", "screen_shake", "blur", "flash", "silence_pause", "vignette"]),
  duration: z.number().min(0).max(30).optional(),
  intensity: z.number().min(0).max(1).optional(),
});

export const directorOutputSchema = z.object({
  speakers: z.array(z.string().min(1)).min(0).max(3),
  silence: z.boolean().default(false),
  event: z.string().nullable().default(null),
  narratorInstruction: z.string().nullable().default(null),
  characterIntents: z.record(z.string(), z.string()).default({}),
  stateDelta: directorStateDeltaSchema.default({}),
  subObjectiveUpdate: directorSubObjectiveUpdateSchema.nullable().default(null),
  relationshipUpdate: directorRelationshipUpdateSchema.nullable().default(null),
  directives: z.array(directorDirectiveSchema).default([]),
  delay: z.number().nullable().default(null),
});
