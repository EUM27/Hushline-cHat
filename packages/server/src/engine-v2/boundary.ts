import type {
  BoundaryReport,
  BoundaryViolation,
  CaseAnswerScope,
  CharacterDefinition,
  DirectorOutput,
  ScenarioPack,
  WorldState,
} from "@hushline/shared";

export const EMPTY_BOUNDARY_REPORT: BoundaryReport = {
  corrected: false,
  violations: [],
};

const SAFE_DIRECTOR_INTENT = "공개된 정보와 자기 입장만 사용해 현재 장면에 짧게 반응한다.";
const SAFE_NARRATION = "공개적으로 보이는 움직임과 공간의 압력만 남는다.";
const SAFE_CHARACTER_LINE = "\"...잠깐만.\"";

const revealPattern = /(범인\s*(은|는|이|가)|살인범\s*(은|는|이|가)|공범\s*(은|는|이|가)|진상|정답|트릭[^.!?\n]*(설명|밝히|드러|공개)|밀실\s*트릭|자백)/i;
const narratorMindPattern = /(속으로|마음속|생각했다|느꼈다|결심했다|알고 있었다|원했다|의도했다)/i;
const userAgencyPattern = /({{유저}}|유저|당신|너)\s*(은|는|이|가)?[^.!?\n]*(생각|느꼈|결심|말했|대답했|걸었|움직였|집어|꺼냈|확신|고개|끄덕|웃었|울었)/i;
const labelDialoguePattern = /^.{1,24}\s*[:：]\s*["“]?/m;
const narratorDialogueProsePattern = /(["“][^"”\n]{2,120}["”])|([A-Za-z가-힣0-9_]{1,24}\s*(은|는|이|가)?[^.!?\n]*(말했|중얼거렸|대답했|외쳤|속삭였|물었|소리쳤|읊조렸|답했다))/i;

export function mergeBoundaryReports(...reports: BoundaryReport[]): BoundaryReport {
  const violations = reports.flatMap((report) => report.violations);
  return {
    corrected: violations.length > 0,
    violations,
  };
}

export function enforceDirectorBoundary(
  directorOutput: DirectorOutput,
  worldState: WorldState,
  pack: ScenarioPack,
): { output: DirectorOutput; report: BoundaryReport } {
  const violations: BoundaryViolation[] = [];
  const output: DirectorOutput = {
    ...directorOutput,
    stateDelta: { ...directorOutput.stateDelta },
    characterIntents: { ...directorOutput.characterIntents },
  };

  const allowedBackgroundIds = new Set([
    worldState.backgroundId,
    pack.scenarioCard.initialBackgroundId,
    ...pack.scenarioCard.backgroundIds,
  ].filter(Boolean));
  const allowedLocationIds = new Set([
    worldState.locationId,
    pack.scenarioCard.initialLocationId,
    ...pack.scenarioCard.backgroundIds,
  ].filter(Boolean));

  if (output.stateDelta.backgroundId && !allowedBackgroundIds.has(output.stateDelta.backgroundId)) {
    delete output.stateDelta.backgroundId;
    violations.push(makeViolation("director", "invalid-background", "허용되지 않은 backgroundId를 제거했습니다.", "removed", "stateDelta.backgroundId"));
  }

  if (output.stateDelta.locationId && !allowedLocationIds.has(output.stateDelta.locationId)) {
    delete output.stateDelta.locationId;
    violations.push(makeViolation("director", "invalid-location", "허용되지 않은 locationId를 제거했습니다.", "removed", "stateDelta.locationId"));
  }

  if (containsUnearnedReveal(output.event)) {
    output.event = null;
    violations.push(makeViolation("director", "premature-event-reveal", "조사 전 진상 노출 가능성이 있는 event를 제거했습니다.", "removed", "event"));
  }

  if (containsUnearnedReveal(output.narratorInstruction)) {
    output.narratorInstruction = "공개적으로 관찰 가능한 단서와 현재 장면의 압력만 묘사한다. 진상이나 범인을 단정하지 않는다.";
    violations.push(makeViolation("director", "premature-narrator-reveal", "조사 전 진상 노출 가능성이 있는 narratorInstruction을 안전 지시로 대체했습니다.", "replaced", "narratorInstruction"));
  }

  for (const [characterId, intent] of Object.entries(output.characterIntents)) {
    if (containsForeignHiddenInfo(intent, characterId, pack.characters)) {
      output.characterIntents[characterId] = SAFE_DIRECTOR_INTENT;
      violations.push(makeViolation("director", "foreign-hidden-intent", "캐릭터가 모르는 비공개 정보를 담은 intent를 대체했습니다.", "replaced", `characterIntents.${characterId}`, characterId));
    }
  }

  return reportResult(output, violations);
}

export function enforceNarratorBoundary(content: string | null): { content: string | null; report: BoundaryReport } {
  const violations: BoundaryViolation[] = [];
  if (!content) {
    return { content, report: EMPTY_BOUNDARY_REPORT };
  }
  const inspectableContent = stripBackgroundTags(content);

  if (labelDialoguePattern.test(inspectableContent)) {
    violations.push(makeViolation("narrator", "dialogue-label", "나레이터 출력에 캐릭터 대사 라벨이 있어 fallback으로 대체했습니다.", "fallback", "content"));
  }
  if (narratorDialogueProsePattern.test(inspectableContent)) {
    violations.push(makeViolation("narrator", "dialogue-prose", "나레이터 출력이 캐릭터 대사나 발화문을 작성해 fallback으로 대체했습니다.", "fallback", "content"));
  }
  if (narratorMindPattern.test(inspectableContent)) {
    violations.push(makeViolation("narrator", "private-motive", "나레이터가 캐릭터 속마음이나 동기를 확정해 fallback으로 대체했습니다.", "fallback", "content"));
  }
  if (containsUnearnedReveal(inspectableContent)) {
    violations.push(makeViolation("narrator", "premature-reveal", "나레이터가 비공개 정답을 확정해 fallback으로 대체했습니다.", "fallback", "content"));
  }
  if (userAgencyPattern.test(inspectableContent)) {
    violations.push(makeViolation("narrator", "user-agency", "나레이터가 유저 행동이나 판단을 대행해 fallback으로 대체했습니다.", "fallback", "content"));
  }

  return {
    content: violations.length > 0 ? SAFE_NARRATION : content,
    report: makeReport(violations),
  };
}

export function enforceCharacterBoundary(
  content: string | null,
  characterId: string,
  pack: ScenarioPack,
  fallbackContent = SAFE_CHARACTER_LINE,
  answerScope?: CaseAnswerScope | null,
): { content: string | null; report: BoundaryReport } {
  const violations: BoundaryViolation[] = [];
  if (!content) {
    return { content, report: EMPTY_BOUNDARY_REPORT };
  }

  if (containsForeignLabel(content, characterId, pack.characters)) {
    violations.push(makeViolation("character", "foreign-dialogue", "캐릭터 출력이 타인 대사나 행동을 작성해 fallback으로 대체했습니다.", "fallback", "content", characterId));
  }
  if (!matchesCharacterOutputFormat(content)) {
    violations.push(makeViolation("character", "format-contract", "캐릭터 출력이 \"대사\" 또는 '생각' 형식을 벗어나 fallback으로 대체했습니다.", "fallback", "content", characterId));
  }
  if (containsSceneNarration(content)) {
    violations.push(makeViolation("character", "scene-narration", "캐릭터 출력이 장면 전체 서술로 넘어가 fallback으로 대체했습니다.", "fallback", "content", characterId));
  }
  if (containsEmbeddedNarration(content)) {
    violations.push(makeViolation("character", "embedded-narration", "캐릭터 출력이 대사 사이에 행동/나레이션 문단을 섞어 fallback으로 대체했습니다.", "fallback", "content", characterId));
  }
  if (containsUnearnedReveal(content)) {
    violations.push(makeViolation("character", "omniscient-knowledge", "캐릭터 출력이 전지적/비공개 정보를 사용해 fallback으로 대체했습니다.", "fallback", "content", characterId));
  }
  if (answerScope && containsBlockedTruth(content, answerScope, pack)) {
    violations.push(makeViolation("character", "hidden-truth-leak", "캐릭터 출력이 차단된 진상/트릭 정보를 언급해 fallback으로 대체했습니다.", "fallback", "content", characterId));
  }
  if (answerScope && containsUnauthorizedCaseFact(content, answerScope, pack)) {
    violations.push(makeViolation("character", "unauthorized-fact", "캐릭터 출력이 이번 턴 허용 범위 밖의 사건 사실을 말해 fallback으로 대체했습니다.", "fallback", "content", characterId));
  }
  if (userAgencyPattern.test(content)) {
    violations.push(makeViolation("character", "user-agency", "캐릭터 출력이 유저 행동이나 판단을 대행해 fallback으로 대체했습니다.", "fallback", "content", characterId));
  }

  return {
    content: violations.length > 0 ? fallbackContent : content,
    report: makeReport(violations),
  };
}

function containsUnearnedReveal(content: string | null | undefined): boolean {
  return Boolean(content && revealPattern.test(content));
}

function stripBackgroundTags(content: string): string {
  return content.replace(/\[bg:[^\]]+\]/g, "").trim();
}

function containsForeignHiddenInfo(content: string | null | undefined, ownerId: string, characters: CharacterDefinition[]): boolean {
  if (!content) return false;
  const owner = characters.find((character) => character.id === ownerId);
  const ownerText = [
    owner?.handout.secret,
    owner?.handout.desire,
    owner?.handout.objective,
    owner?.handout.fear,
    ...(owner?.handout.behaviorRules ?? []),
  ].filter(Boolean).join("\n");

  for (const character of characters) {
    if (character.id === ownerId) continue;
    const hiddenChunks = [
      character.handout.secret,
      character.handout.desire,
      character.handout.objective,
      character.handout.fear,
      ...(character.handout.behaviorRules ?? []),
    ].flatMap(extractSignalTerms);

    for (const term of hiddenChunks) {
      if (term.length >= 3 && content.includes(term) && !ownerText.includes(term)) {
        return true;
      }
    }
  }

  return false;
}

function extractSignalTerms(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3))];
}

function containsForeignLabel(content: string, characterId: string, characters: CharacterDefinition[]): boolean {
  return characters.some((character) => {
    if (character.id === characterId) return false;
    const labels = [character.name, character.shortName, character.anonymousLabel, character.id].filter(Boolean);
    return labels.some((label) => new RegExp(`(^|\\n)\\s*${escapeRegExp(label!)}\\s*[:：]`).test(content))
      || labels.some((label) => new RegExp(`${escapeRegExp(label!)}\\s*(은|는|이|가)\\s*["“]?`).test(content));
  });
}

function matchesCharacterOutputFormat(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  const quotedSegment = /(?:["“][^"”\n]+["”]|['‘][^'’\n]+['’])/y;
  let index = 0;
  while (index < trimmed.length) {
    while (/\s/.test(trimmed[index] ?? "")) index += 1;
    quotedSegment.lastIndex = index;
    const match = quotedSegment.exec(trimmed);
    if (!match || match.index !== index) {
      return false;
    }
    index = quotedSegment.lastIndex;
  }
  return true;
}

function containsSceneNarration(content: string): boolean {
  return /(방 안|공기|카메라|시야|주변|복도|창밖|조명이|침묵이)/.test(content)
    && /(그는|그녀는|모두|사람들|일행)/.test(content);
}

function containsEmbeddedNarration(content: string): boolean {
  const paragraphs = content.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (paragraphs.length < 2) {
    return false;
  }

  return paragraphs.some((paragraph, index) => {
    if (index === 0 && paragraphs.length === 2) {
      return false;
    }
    return looksLikeActionOrNarrationParagraph(paragraph);
  });
}

function looksLikeActionOrNarrationParagraph(paragraph: string): boolean {
  const compact = paragraph.trim();
  if (!compact) {
    return false;
  }
  if (/^["“].+["”]$/.test(compact)) {
    return false;
  }
  if (/[?？!！]$/.test(compact)) {
    return false;
  }
  return /(며|면서|듯|한 채|한채|하고|하며|닫으며|돌리며|구겼다|찡그렸|내려놓|집어|들었|바라봤|쳐다봤|고개|시선|손가락|손을|입술|숨을|침묵|공기|주변|복도|창밖)/.test(compact)
    || /(했다|하였다|있었다|없었다|보였다|들렸다|남았다|흘렀다|가라앉았다|굳었다|닫혔다|열렸다)\.?$/.test(compact);
}

function containsBlockedTruth(content: string, answerScope: CaseAnswerScope, pack: ScenarioPack): boolean {
  const blocked = new Set(answerScope.blockedTruthIds);
  const truths = pack.caseKnowledge?.hiddenTruths.filter((truth) => blocked.has(truth.id)) ?? [];
  return truths.some((truth) =>
    truth.blockedKeywords.some((keyword) => content.includes(keyword)),
  );
}

function containsUnauthorizedCaseFact(content: string, answerScope: CaseAnswerScope, pack: ScenarioPack): boolean {
  const blocked = new Set(answerScope.blockedFactIds);
  const facts = [...(pack.caseKnowledge?.publicFacts ?? []), ...(pack.caseKnowledge?.observableFacts ?? [])]
    .filter((fact) => blocked.has(fact.id));
  return facts.some((fact) => factMatchesContent(fact.text, fact.tags, content));
}

function factMatchesContent(factText: string, tags: string[], content: string): boolean {
  const signalTerms = [
    ...extractSignalTerms(factText),
    ...tags.flatMap(tagToKoreanMarkers),
  ].filter((term) => term.length >= 2);
  const unique = [...new Set(signalTerms)];
  const hits = unique.filter((term) => content.includes(term));
  return hits.length >= 2 || (hits.length >= 1 && unique.some((term) => term.length >= 5 && content.includes(term)));
}

function tagToKoreanMarkers(tag: string): string[] {
  const markers: Record<string, string[]> = {
    key: ["열쇠"],
    table: ["테이블", "탁자"],
    blackout: ["정전"],
    lounge: ["라운지", "거실"],
    locked_room: ["밀실", "잠긴"],
    victim: ["피해자", "윤태식"],
    killer: ["범인", "살인범"],
    truth: ["진상", "정답"],
  };
  return markers[tag] ?? [];
}

function reportResult<T>(output: T, violations: BoundaryViolation[]): { output: T; report: BoundaryReport } {
  return { output, report: makeReport(violations) };
}

function makeReport(violations: BoundaryViolation[]): BoundaryReport {
  return {
    corrected: violations.length > 0,
    violations,
  };
}

function makeViolation(
  layer: BoundaryViolation["layer"],
  code: string,
  message: string,
  action: BoundaryViolation["action"],
  path?: string,
  characterId?: string,
): BoundaryViolation {
  return {
    layer,
    code,
    message,
    action,
    ...(path ? { path } : {}),
    ...(characterId ? { characterId } : {}),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
