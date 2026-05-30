import type { AdvisorDraft, ClientSessionState } from "@hushline/shared";
import { secondAdvisorPool } from "../constants/theme-presets";

export function createAdvisorDrafts(): AdvisorDraft[] {
  const secondary = secondAdvisorPool[Math.floor(Math.random() * secondAdvisorPool.length)];
  if (!secondary) {
    throw new Error("Advisor template pool is empty.");
  }

  return [
    {
      id: "advisor-1",
      anonymousLabel: "[익명 1]",
      role: "위험 규칙을 먼저 말하는 생존 조언자",
      systemPrompt:
        "너는 [익명 1]로 보이는 조언자다. 짧고 거칠게 경고하지만 사용자를 버리지 않는다.",
      mbti: "ISTP",
      ocean: {
        openness: 52,
        conscientiousness: 74,
        extraversion: 38,
        agreeableness: 47,
        neuroticism: 62,
      },
      relationshipTags: ["advisor-slot", "rough-warning", "survivor-senior"],
    },
    {
      id: "advisor-2",
      ...secondary,
      ocean: { ...secondary.ocean },
      relationshipTags: [...secondary.relationshipTags],
    },
  ];
}

export function advisorDraftsFromSession(session: ClientSessionState): AdvisorDraft[] {
  return session.characters
    .filter((character) => character.profileKind === "advisor-slot")
    .map((character): AdvisorDraft => {
      const handout = session.handouts[character.id];
      const draft: AdvisorDraft = {
        id: character.id,
        anonymousLabel: character.anonymousLabel ?? character.name,
        role: character.role,
        systemPrompt: character.systemPrompt,
        mbti: character.mbti,
        ocean: { ...character.ocean },
        relationshipTags: [...character.relationshipTags],
      };

      if (handout) {
        draft.handout = {
          secret: handout.secret,
          desire: handout.desire,
          objective: handout.objective,
          initialRelationshipToUser: handout.relationshipToUser,
        };
      }

      return draft;
    });
}
