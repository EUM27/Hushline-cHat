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
  relationshipTags: z.array(z.string().max(100)).optional(),
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

// ── Character Card (chara_card_v3 with hushline extension) ──

/** Hushline engine data carried in chara_card_v3 `data.extensions.hushline`. */
export const hushlineCardExtensionSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  shortName: z.string().min(1).max(40).optional(),
  role: z.string().max(400).optional(),
  profileKind: z.enum(["advisor-slot", "named-actor"]).optional(),
  anonymousLabel: z.string().max(40).optional(),
  mbti: z.string().max(20).optional(),
  ocean: oceanSchema.optional(),
  autonomy: z.number().min(0).max(1).optional(),
  relationshipTags: z.array(z.string().max(100)).optional(),
  handout: characterHandoutSchema.partial().optional(),
  relationships: z.array(characterRelationshipDefSchema).optional(),
  spriteSetId: z.string().optional(),
  avatarId: z.string().optional(),
});

export const characterCardSchema = z.object({
  spec: z.string().optional(),
  spec_version: z.string().optional(),
  data: z.object({
    name: z.string().min(1).max(80),
    description: z.string().max(8000).default(""),
    personality: z.string().max(4000).default(""),
    scenario: z.string().max(4000).optional(),
    first_mes: z.string().max(8000).optional(),
    system_prompt: z.string().max(8000).optional(),
    post_history_instructions: z.string().max(8000).optional(),
    tags: z.array(z.string()).optional(),
    alternate_greetings: z.array(z.string()).optional(),
    extensions: z.object({
      hushline: hushlineCardExtensionSchema.optional(),
    }).passthrough().optional(),
  }),
});

// ── Event Triggers ──

export const eventTriggerSchema = z.object({
  id: z.string().min(1).max(80),
  condition: z.string().min(1).max(1000),
  description: z.string().min(1).max(2000),
  oneShot: z.boolean().default(true),
});

// ── Scene Occurrence Device ──
export const sceneOccurrenceDeviceSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum([
    "relational", "informational", "npc_driven", "social", "logistical", "quiet_texture", "timed_optional",
  ]),
  trigger: z.object({
    conditionType: z.string().min(1).max(80),
    conditionValue: z.unknown(),
    requiresAll: z.array(z.string().min(1).max(120)).optional(),
    requiresAny: z.array(z.string().min(1).max(120)).optional(),
    blocksIf: z.array(z.string().min(1).max(120)).optional(),
  }),
  effect: z.object({
    sceneBeat: z.string().min(1).max(2000),
    stateDelta: z.object({
      tension: z.number().min(-10).max(10).optional(),
      danger: z.number().min(-10).max(10).optional(),
      factReveals: z.array(z.string().min(1).max(120)).optional(),
      relationshipChanges: z.array(z.object({
        sourceId: z.string().min(1).max(120),
        targetId: z.string().min(1).max(120),
        descriptor: z.string().min(1).max(100),
        intensityDelta: z.number().min(-10).max(10),
      })).optional(),
    }).optional(),
    npcReactions: z.array(z.object({
      npcId: z.string().min(1).max(120),
      reaction: z.string().min(1).max(500),
    })).optional(),
  }),
  oneShot: z.boolean(),
  cooldown: z.number().int().min(0).max(100).optional(),
  priority: z.number().min(0).max(100).optional(),
});

// ── Case Knowledge ──

export const caseInquiryTypeSchema = z.enum([
  "general_dialogue",
  "case_briefing_request",
  "case_summary_request",
  "observable_scene_request",
  "location_search",
  "object_query",
  "timeline_query",
  "alibi_query",
  "witness_testimony",
  "accusation",
  "truth_request",
  "contradiction_challenge",
  "deduction_attempt",
  "hypothesis",
  "evidence_presentation",
  "ooc_meta_request",
  "unknown",
]);

export const caseRequestedTruthLevelSchema = z.enum([
  "none",
  "public",
  "observable",
  "testimony",
  "deduction",
  "hidden_truth",
]);

export const caseFactSchema = z.object({
  id: z.string().min(1).max(120),
  text: z.string().min(1).max(1000),
  tags: z.array(z.string().min(1).max(80)).default([]),
  category: z.enum([
    "briefing",
    "public",
    "observable",
    "timeline",
    "object",
    "location",
    "witness",
    "clue",
    "hidden_truth",
    "solution",
  ]).optional(),
  truthStatus: z.enum(["true", "false", "unknown", "ambiguous"]).optional(),
  importance: z.enum(["flavor", "case_basic", "clue", "critical", "solution"]).optional(),
  locationId: z.string().min(1).max(120).optional(),
  objectIds: z.array(z.string().min(1).max(120)).optional(),
  knownBy: z.union([z.literal("all"), z.array(z.string().min(1).max(120))]).optional(),
  visibility: z.object({
    knownBy: z.array(z.object({
      agentId: z.string().min(1),
      source: z.enum(["public", "saw", "heard", "experienced", "inferred", "told", "omniscient"]),
      confidence: z.number().min(0).max(1),
    })).default([]),
    blockedFrom: z.array(z.object({
      agentId: z.string().min(1),
      reason: z.string().min(1),
    })).optional(),
  }).optional(),
  evidence: z.object({
    sourceType: z.enum(["shared_observation", "physical_evidence", "witness", "document", "deduction", "hidden"]),
    reliability: z.number().min(0).max(1),
  }).optional(),
});

export const testimonySeedConditionSchema = z.object({
  requiresQuestionSpecificity: z.number().int().min(0).max(3).optional(),
  requiresTopicMention: z.array(z.string().min(1).max(80)).optional(),
  requiresEvidence: z.array(z.string().min(1).max(120)).optional(),
  requiresPriorFact: z.array(z.string().min(1).max(120)).optional(),
  requiresTrust: z.number().min(0).max(100).optional(),
});

export const testimonySeedRevealWhenSchema = z.object({
  inquiryTypes: z.array(caseInquiryTypeSchema).optional(),
  topicTags: z.array(z.string().min(1).max(80)).optional(),
  objectIds: z.array(z.string().min(1).max(120)).optional(),
  locationIds: z.array(z.string().min(1).max(120)).optional(),
});

export const testimonySeedSchema = z.object({
  id: z.string().min(1).max(120),
  npcId: z.string().min(1).max(120).optional(),
  characterId: z.string().min(1).max(120),
  factRefs: z.array(z.string().min(1).max(120)).optional(),
  factIds: z.array(z.string().min(1).max(120)).default([]),
  topicTags: z.array(z.string().min(1).max(80)).default([]),
  defaultRevealLevel: z.enum(["none", "hint", "partial", "full", "lie", "deflect", "refuse", "mistaken"]).default("partial"),
  certainty: z.enum(["certain", "uncertain", "denial"]).default("uncertain"),
  canSay: z.array(z.string().min(1).max(1000)).default([]),
  mustNotSay: z.array(z.string().min(1).max(1000)).default([]),
  condition: testimonySeedConditionSchema.optional(),
  revealWhen: testimonySeedRevealWhenSchema.optional(),
});

export const hiddenTruthRefSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
  tags: z.array(z.string().min(1).max(80)).default([]),
  blockedKeywords: z.array(z.string().min(1).max(120)).default([]),
});

export const caseLorebookActorSchema = z.enum(["director", "narrator", "character", "case_board", "deduction_validator"]);
export const caseLorebookSecretLevelSchema = z.enum(["public", "observable", "testimony", "private_npc", "major_secret", "solution"]);
export const caseLorebookEntrySourceSchema = z.enum(["fact", "testimony", "hidden_truth", "solution_graph"]);

export const caseLorebookEntrySchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(4000),
  tags: z.array(z.string().min(1).max(80)).default([]),
  sourceType: caseLorebookEntrySourceSchema,
  secretLevel: caseLorebookSecretLevelSchema,
  linkedFactIds: z.array(z.string().min(1).max(120)).default([]),
  category: z.enum([
    "briefing",
    "public",
    "observable",
    "timeline",
    "object",
    "location",
    "witness",
    "clue",
    "hidden_truth",
    "solution",
  ]).optional(),
  npcId: z.string().min(1).max(120).optional(),
  locationId: z.string().min(1).max(120).optional(),
  objectIds: z.array(z.string().min(1).max(120)).optional(),
  revealWhen: testimonySeedRevealWhenSchema.optional(),
  condition: testimonySeedConditionSchema.optional(),
  canSay: z.array(z.string().min(1).max(1000)).optional(),
  mustNotSay: z.array(z.string().min(1).max(1000)).optional(),
  visibility: z.object({
    readableBy: z.array(caseLorebookActorSchema).default([]),
    knownBy: z.union([z.literal("all"), z.array(z.string().min(1).max(120))]).optional(),
    blockedFrom: z.array(z.string().min(1).max(120)).optional(),
  }),
});

export const caseLorebookTreeNodeSchema: z.ZodType<{
  id: string;
  label: string;
  summary: string;
  entryIds: string[];
  children: Array<{
    id: string;
    label: string;
    summary: string;
    entryIds: string[];
    children: unknown[];
  }>;
}> = z.lazy(() => z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  summary: z.string().max(1000).default(""),
  entryIds: z.array(z.string().min(1).max(120)).default([]),
  children: z.array(caseLorebookTreeNodeSchema).default([]),
}));

export const caseLorebookSchema = z.object({
  entries: z.array(caseLorebookEntrySchema).default([]),
  tree: caseLorebookTreeNodeSchema,
});

export const caseKnowledgeSchema = z.object({
  publicFacts: z.array(caseFactSchema).default([]),
  observableFacts: z.array(caseFactSchema).default([]),
  testimonySeeds: z.array(testimonySeedSchema).default([]),
  hiddenTruths: z.array(hiddenTruthRefSchema).default([]),
  lorebook: caseLorebookSchema.optional(),
  facts: z.array(caseFactSchema).optional(),
  timeline: z.array(z.object({
    id: z.string().min(1),
    time: z.string().min(1),
    publicLabel: z.string().optional(),
    eventRefs: z.array(z.string()).optional(),
    locationStates: z.record(z.string(), z.object({
      present: z.array(z.string()).optional(),
      observableObjects: z.array(z.string()).optional(),
      observableFactIds: z.array(z.string()).optional(),
    })).optional(),
  })).optional(),
  locations: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    tags: z.array(z.string()).default([]),
    observableFactIds: z.array(z.string()).optional(),
    objectIds: z.array(z.string()).optional(),
  })).optional(),
  objects: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    tags: z.array(z.string()).default([]),
    initialLocationId: z.string().optional(),
    factRefs: z.array(z.string()).optional(),
  })).optional(),
  hiddenTruthVault: z.object({
    hiddenTruthIds: z.array(z.string()).default([]),
    blockedByDefault: z.array(z.string()).default([]),
    solutionGraph: z.object({
      caseId: z.string().min(1),
      requiredProofNodes: z.array(z.object({
        id: z.string().min(1),
        type: z.enum(["motive", "means", "opportunity", "timeline", "object_movement", "contradiction", "trick_mechanism", "identity"]),
        requiredRefs: z.array(z.string()).default([]),
        weight: z.number().min(0),
      })).default([]),
      optionalProofNodes: z.array(z.object({
        id: z.string().min(1),
        requiredRefs: z.array(z.string()).default([]),
        weight: z.number().min(0),
      })).default([]),
      disqualifyingErrors: z.array(z.object({
        id: z.string().min(1),
        description: z.string().default(""),
        triggeredByWrongRefs: z.array(z.string()).default([]),
      })).default([]),
      unlockThresholds: z.object({
        partialTruth: z.number().min(0),
        finalTruth: z.number().min(0),
      }),
    }),
  }).optional(),
  revealBudget: z.object({
    scope: z.enum(["per_fact", "per_npc", "per_scene", "per_session"]).default("per_fact"),
    perFact: z.record(z.string(), z.object({
      hintCount: z.number().int().min(0).default(0),
      partialCount: z.number().int().min(0).default(0),
      fullCount: z.number().int().min(0).default(0),
      maxHints: z.number().int().min(0).optional(),
      maxPartial: z.number().int().min(0).optional(),
      maxFull: z.number().int().min(0),
      hintCooldownTurns: z.number().int().min(0).default(0),
      partialCooldownTurns: z.number().int().min(0).default(0),
      lastHintTurn: z.number().int().min(0).optional(),
      lastPartialTurn: z.number().int().min(0).optional(),
      fullRevealedAtTurn: z.number().int().min(0).optional(),
      fullResetPolicy: z.enum(["never", "on_scene_unlock", "on_final_phase"]).default("never"),
    })).default({}),
  }).optional(),
  ambiguousFacts: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    topicTags: z.array(z.string()).default([]),
    possibleInterpretations: z.array(z.object({
      interpretationId: z.string().min(1),
      description: z.string().min(1),
      supportingFactIds: z.array(z.string()).default([]),
      supportingClaimIds: z.array(z.string()).default([]),
      supportingEvidenceIds: z.array(z.string()).default([]),
      contradictingFactIds: z.array(z.string()).default([]),
      contradictingClaimIds: z.array(z.string()).default([]),
      contradictingEvidenceIds: z.array(z.string()).default([]),
      probability: z.number().min(0).max(1),
      playerVisibleLabel: z.string().optional(),
    })).default([]),
    resolutionCondition: z.object({
      requiredEvidenceIds: z.array(z.string()).optional(),
      requiredClaimIds: z.array(z.string()).optional(),
      requiredContradictionIds: z.array(z.string()).optional(),
      requiredLocationSearches: z.array(z.string()).optional(),
      requiredDeductionScore: z.number().min(0).optional(),
    }),
    resolvedTo: z.string().optional(),
    resolvedAtTurn: z.number().int().min(0).optional(),
    playerVisibleStatus: z.enum(["unnoticed", "noticed", "contested", "nearly_resolved", "resolved"]).default("unnoticed"),
  })).optional(),
});

export const caseInquiryFrameSchema = z.object({
  isCaseInquiry: z.boolean(),
  inquiryType: caseInquiryTypeSchema,
  targetCharacterId: z.string().optional(),
  targetNpcId: z.string().optional(),
  targetObjectId: z.string().optional(),
  targetLocationId: z.string().optional(),
  topicTags: z.array(z.string()).default([]),
  timeWindow: z.enum(["before_blackout", "during_blackout", "after_blackout", "current", "unknown"]).optional(),
  referencedEvidenceIds: z.array(z.string()).default([]),
  referencedClaimIds: z.array(z.string()).default([]),
  referencedFactIds: z.array(z.string()).optional(),
  accusationTargetId: z.string().optional(),
  impliedAccusation: z.boolean().optional(),
  requestedTruthLevel: caseRequestedTruthLevelSchema,
  truthLeakRisk: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

export const caseAllowedWitnessSchema = z.object({
  characterId: z.string().min(1),
  testimonySeedIds: z.array(z.string()).default([]),
  factIds: z.array(z.string()).default([]),
  canSay: z.array(z.string()).default([]),
  mustNotSay: z.array(z.string()).default([]),
  certainty: z.enum(["certain", "uncertain", "denial"]).default("uncertain"),
  maxRevealLevel: z.enum(["none", "hint", "partial", "full", "lie", "deflect", "refuse", "mistaken"]).default("partial"),
});

export const caseAnswerScopeSchema = z.object({
  inquiryFrame: caseInquiryFrameSchema,
  publicFactIds: z.array(z.string()).default([]),
  observableFactIds: z.array(z.string()).default([]),
  allowedWitnesses: z.array(caseAllowedWitnessSchema).default([]),
  blockedFactIds: z.array(z.string()).default([]),
  blockedTruthIds: z.array(z.string()).default([]),
  recommendedSpeakerIds: z.array(z.string()).default([]),
  answerability: z.enum(["none", "partial", "direct"]).default("none"),
  retrievedLoreEntryIds: z.array(z.string()).optional(),
});

export const caseRevealPermissionSchema = z.object({
  allowedFactIds: z.array(z.string()).default([]),
  allowedClaimIds: z.array(z.string()).optional(),
  blockedFactIds: z.array(z.string()).default([]),
  blockedTruthIds: z.array(z.string()).default([]),
  maxRevealLevel: z.enum(["none", "hint", "partial", "full", "lie", "deflect", "refuse", "mistaken"]).default("none"),
  requiredBehavior: z.string().optional(),
  forbiddenClaims: z.array(z.string()).optional(),
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

export const directorMessagePlanItemSchema = z.object({
  kind: z.enum(["narrator", "character", "system"]),
  speakerId: z.string().min(1).optional(),
});

export const directorOutputSchema = z.object({
  speakers: z.array(z.string().min(1)).min(0).max(3),
  silence: z.boolean().default(false),
  event: z.string().nullable().default(null),
  narratorInstruction: z.string().nullable().default(null),
  characterIntents: z.record(z.string(), z.string()).default({}),
  inquiry: caseInquiryFrameSchema.optional(),
  answerScope: caseAnswerScopeSchema.optional(),
  revealPermissions: z.record(z.string(), caseRevealPermissionSchema).optional(),
  caseDebug: z.object({
    selectedSpeakerReason: z.string().optional(),
    blockedReasonSummary: z.array(z.string()).default([]),
    truthLeakRisk: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  }).optional(),
  messagePlan: z.array(directorMessagePlanItemSchema).max(8).optional(),
  stateDelta: directorStateDeltaSchema.default({}),
  subObjectiveUpdate: directorSubObjectiveUpdateSchema.nullable().default(null),
  relationshipUpdate: directorRelationshipUpdateSchema.nullable().default(null),
  directives: z.array(directorDirectiveSchema).default([]),
  delay: z.number().nullable().default(null),
});
