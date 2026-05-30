import type { CharacterDefinition, CharacterHandoutDefinition, ScenarioPack, SessionStateV2 } from "@hushline/shared";
import type { AdvisorDraftInput } from "./schemas.js";
import { clamp, cleanStringArray, nonEmpty, stripAnonymousBrackets, uniqueStrings } from "./utils.js";

export function applyAdvisorDrafts(pack: ScenarioPack, advisorDrafts?: AdvisorDraftInput[]): ScenarioPack {
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

export function packWithSessionCharacters(pack: ScenarioPack, session: SessionStateV2): ScenarioPack {
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
  return {
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
