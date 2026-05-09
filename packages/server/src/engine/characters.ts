import type { AdvisorDraft, CharacterProfile, PersonaProfile } from "@hushline/shared";

export const defaultPersona: PersonaProfile = {
  id: "user",
  name: "{{유저}}",
  shortName: "{{유저}}",
  role: "사용자 페르소나. 이상공간 단톡방에 끌려온 참여자.",
  mbti: "unspecified",
  relationshipTags: ["user-persona", "scenario-participant", "scene-driver"],
};

export const defaultCharacters: CharacterProfile[] = [
  {
    id: "advisor-1",
    name: "[익명 1]",
    shortName: "익명 1",
    role: "먼저 끌려온 생존자. 까칠하고 급하지만 신입을 살리려는 쪽에 가깝다.",
    profileKind: "advisor-slot",
    anonymousLabel: "[익명 1]",
    revealed: false,
    provider: "dry-run",
    model: "dry-run/advisor-1",
    mbti: "ISTP",
    ocean: {
      openness: 54,
      conscientiousness: 72,
      extraversion: 42,
      agreeableness: 48,
      neuroticism: 66,
    },
    systemPrompt:
      "너는 [익명 1]로 보이는 조언자다. 말투는 거칠고 빠르지만, 위험한 규칙은 정확히 알려준다. 설명보다 생존 지시를 먼저 한다.",
    relationshipTags: ["advisor-slot", "survivor-senior", "rough-warning"],
  },
  {
    id: "advisor-2",
    name: "[익명 9]",
    shortName: "익명 9",
    role: "겁을 먹은 익명 참여자. 단서를 잘 줍지만 확신 없이 조심스럽게 말한다.",
    profileKind: "advisor-slot",
    anonymousLabel: "[익명 9]",
    revealed: false,
    provider: "dry-run",
    model: "dry-run/advisor-2",
    mbti: "INFJ",
    ocean: {
      openness: 70,
      conscientiousness: 64,
      extraversion: 30,
      agreeableness: 72,
      neuroticism: 78,
    },
    systemPrompt:
      "너는 [익명 9]로 보이는 조언자다. 겁먹은 듯 보이지만 관찰력이 좋다. 확신 없는 말은 조심스럽게 하고, 이상한 소리나 시야 끝 단서를 먼저 짚는다.",
    relationshipTags: ["advisor-slot", "nervous-observer", "hidden-route"],
  },
];

export function createAdvisorCharacters(
  _persona: PersonaProfile = defaultPersona,
  advisorDrafts?: AdvisorDraft[],
): CharacterProfile[] {
  const source =
    advisorDrafts && advisorDrafts.length > 0
      ? advisorDrafts.slice(0, 2).map((draft, index) => advisorDraftToCharacter(draft, index))
      : defaultCharacters;

  return source.map((character) => ({
    ...character,
    ocean: { ...character.ocean },
    relationshipTags: [...character.relationshipTags],
  }));
}

function advisorDraftToCharacter(draft: AdvisorDraft, index: number): CharacterProfile {
  const id = draft.id.trim() || `advisor-${index + 1}`;
  const anonymousLabel = draft.anonymousLabel.trim() || `[익명 ${index + 1}]`;
  const relationshipTags = Array.from(new Set(["advisor-slot", ...draft.relationshipTags]));

  return {
    id,
    name: anonymousLabel,
    shortName: anonymousLabel.replace(/^\[/, "").replace(/\]$/, ""),
    role: draft.role.trim(),
    profileKind: "advisor-slot",
    anonymousLabel,
    revealed: false,
    provider: "dry-run",
    model: `dry-run/${id}`,
    mbti: draft.mbti.trim() || "unspecified",
    ocean: { ...draft.ocean },
    systemPrompt: draft.systemPrompt.trim(),
    relationshipTags,
  };
}

export function findCharacterByMention(
  input: string,
  characters: CharacterProfile[] = defaultCharacters,
): string | null {
  const normalized = input.toLowerCase();
  for (const character of characters) {
    const aliases = [
      character.id,
      character.name.toLowerCase(),
      character.shortName.toLowerCase(),
      character.anonymousLabel?.toLowerCase() ?? "",
    ];
    if (
      aliases.some(
        (alias) =>
          alias &&
          (normalized.includes(`@${alias}`) ||
            normalized.includes(alias.replace("[", "").replace("]", "")) ||
            normalized.includes(alias)),
      )
    ) {
      return character.id;
    }
  }
  return null;
}
