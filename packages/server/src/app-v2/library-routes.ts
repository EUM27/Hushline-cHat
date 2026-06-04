import type { Hono } from "hono";
import type { CharacterDefinition } from "@hushline/shared";
import type { ProfileLibraryStore, ReusablePersonaProfile } from "../store/profile-library-store.js";
import {
  saveCharacterCardBodySchema,
  savePersonaProfileBodySchema,
  type ReusablePersonaProfileInput,
  type SaveCharacterCardInput,
} from "./schemas.js";

export function registerProfileLibraryRoutes(app: Hono, store: ProfileLibraryStore) {
  app.get("/api/v2/personas", (context) => {
    return context.json({ personas: store.listPersonaProfiles() });
  });

  app.post("/api/v2/personas", async (context) => {
    const parsed = savePersonaProfileBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Invalid persona profile request", details: parsed.error.issues }, 400);
    }

    const saved = store.savePersonaProfile({
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      label: parsed.data.label ?? parsed.data.persona.name,
      persona: reusablePersonaInputToProfile(parsed.data.persona),
    });

    return context.json({ persona: saved }, 201);
  });

  app.get("/api/v2/character-cards", (context) => {
    return context.json({ characterCards: store.listCharacterCards() });
  });

  app.post("/api/v2/character-cards", async (context) => {
    const parsed = saveCharacterCardBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Invalid character card request", details: parsed.error.issues }, 400);
    }

    const saved = store.saveCharacterCard({
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      name: parsed.data.name ?? parsed.data.character.name,
      ...(parsed.data.sourceFileName ? { sourceFileName: parsed.data.sourceFileName } : {}),
      ...(parsed.data.sourceMetadata ? { sourceMetadata: parsed.data.sourceMetadata } : {}),
      character: characterInputToDefinition(parsed.data.character),
    });

    return context.json({ characterCard: saved }, 201);
  });
}

function reusablePersonaInputToProfile(persona: ReusablePersonaProfileInput): ReusablePersonaProfile {
  return {
    name: persona.name,
    ...(persona.shortName ? { shortName: persona.shortName } : {}),
    ...(persona.role ? { role: persona.role } : {}),
    ...(persona.description ? { description: persona.description } : {}),
    ...(persona.appearance ? { appearance: persona.appearance } : {}),
    ...(persona.portraitUrl ? { portraitUrl: persona.portraitUrl } : {}),
    relationshipTags: [...(persona.relationshipTags ?? [])],
  };
}

function characterInputToDefinition(character: SaveCharacterCardInput["character"]): CharacterDefinition {
  return {
    id: character.id,
    name: character.name,
    shortName: character.shortName,
    role: character.role,
    profileKind: character.profileKind ?? "named-actor",
    ...(character.anonymousLabel ? { anonymousLabel: character.anonymousLabel } : {}),
    mbti: character.mbti,
    ocean: { ...character.ocean },
    autonomy: character.autonomy,
    systemPrompt: character.systemPrompt,
    ...(character.relationshipTags?.length ? { relationshipTags: [...character.relationshipTags] } : {}),
    handout: {
      secret: character.handout.secret,
      desire: character.handout.desire,
      objective: character.handout.objective,
      initialRelationshipToUser: character.handout.initialRelationshipToUser,
      ...(character.handout.surfacePersonality?.length ? { surfacePersonality: [...character.handout.surfacePersonality] } : {}),
      ...(character.handout.fear ? { fear: character.handout.fear } : {}),
      ...(character.handout.behaviorRules?.length ? { behaviorRules: [...character.handout.behaviorRules] } : {}),
    },
    relationships: character.relationships.map((relationship) => ({ ...relationship })),
    ...(character.spriteSetId ? { spriteSetId: character.spriteSetId } : {}),
    ...(character.avatarId ? { avatarId: character.avatarId } : {}),
  };
}
