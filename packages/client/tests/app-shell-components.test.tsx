import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppToolStrip } from "../src/components/AppToolStrip";
import { PhoneSubScreen } from "../src/components/PhoneSubScreen";
import { ScenarioShell } from "../src/components/ScenarioShell";
import { AdvisorSetupPanel } from "../src/components/setup/AdvisorSetupPanel";
import { CharacterCardImport } from "../src/components/setup/CharacterCardImport";
import { PersonaSetupPanel } from "../src/components/setup/PersonaSetupPanel";
import { ScenarioSetupPanel } from "../src/components/setup/ScenarioSetupPanel";
import { visualThemePresets } from "../src/constants/theme-presets";
import type { ClientSessionState } from "@hushline/shared";
import type {
  CharacterCardSourceMetadata,
  ImportedCharacterCard,
  V2ScenarioDetailResponse,
} from "../src/api-v2";

describe("app shell component modules", () => {
  test("exports the extracted app shell components", () => {
    expect(typeof AppToolStrip).toBe("function");
    expect(typeof PhoneSubScreen).toBe("function");
    expect(typeof ScenarioShell).toBe("function");
    expect(typeof ScenarioSetupPanel).toBe("function");
    expect(typeof PersonaSetupPanel).toBe("function");
    expect(typeof AdvisorSetupPanel).toBe("function");
  });

  test("renders a phone-visible model settings entry during a session", () => {
    const html = renderToStaticMarkup(
      <PhoneSubScreen
        session={createMobileSession()}
        theme={visualThemePresets.moonlight}
        visibleMessages={[]}
        isSending={false}
        themeOptions={[visualThemePresets.moonlight]}
        isThemeOpen={false}
        isModelSettingsOpen={false}
        modelSettingsPanel={<div>model panel</div>}
        chatInput=""
        onToggleTheme={() => undefined}
        onSelectTheme={() => undefined}
        onToggleModelSettings={() => undefined}
        onCloseModelSettings={() => undefined}
        onChatInputChange={() => undefined}
        onChatSubmit={(event) => event.preventDefault()}
      />,
    );

    expect(html).toContain('aria-label="모델 설정 열기"');
  });

  test("renders persona maker and relationship tag controls in setup", () => {
    const html = renderToStaticMarkup(
      <PersonaSetupPanel
        personaDraft={{
          name: "정해윤",
          shortName: "해윤",
          role: "공유주택에 막 들어온 새 입주자",
          description: "경계심이 있지만 사람을 밀어내지는 않는다.",
          appearance: "비에 젖은 회색 후드와 낡은 운동화를 신고 있다.",
          relationshipTags: ["new-tenant", "keeps-distance"],
        }}
        personaPrompt="비 오는 밤 공유주택에 도착한 새 입주자"
        relationshipTagText="new-tenant, keeps-distance"
        hasScenarioAdvisors
        isStarting={false}
        isGeneratingPersona={false}
        isSavingPersona={false}
        error={null}
        personaGenerationError={null}
        libraryStatus={null}
        savedPersonaProfiles={[]}
        onDraftChange={() => undefined}
        onPersonaPromptChange={() => undefined}
        onRelationshipTagTextChange={() => undefined}
        onGeneratePersona={() => undefined}
        onSavePersona={() => undefined}
        onApplyPersonaProfile={() => undefined}
        onBack={() => undefined}
        onSubmit={(event) => event.preventDefault()}
      />,
    );

    expect(html).toContain("페르소나 생성 프롬프트");
    expect(html).toContain("초안 생성");
    expect(html).toContain("관계 태그");
    expect(html).toContain("new-tenant, keeps-distance");
  });

  test("character card import preview shows source metadata and apply action", () => {
    const html = renderToStaticMarkup(
      <CharacterCardImport
        targetLabel="강무진"
        preview={{
          character: makeImportedCharacterCard({ name: "Antonio", role: "Retired consigliere" }),
          metadata: makeSourceMetadata({
            sourceFileName: "Antonio.png",
            sourceFormat: "png-chara-v2",
            cardSpec: "chara_card_v2",
            creator: "darkmountain",
            extensionKeys: ["janitor"],
            hasFirstMessage: true,
          }),
        }}
        onApply={() => undefined}
      />,
    );

    expect(html).toContain("Antonio");
    expect(html).toContain("Tavern PNG v2");
    expect(html).toContain("darkmountain");
    expect(html).toContain("Janitor");
    expect(html).toContain("강무진 슬롯에 적용");
  });

  test("character card import preview announces a loaded card", () => {
    const html = renderToStaticMarkup(
      <CharacterCardImport
        targetLabel="강무진"
        preview={{
          character: makeImportedCharacterCard({ name: "Antonio", role: "Retired consigliere" }),
          metadata: makeSourceMetadata({
            sourceFileName: "Antonio.png",
            sourceFormat: "png-chara-v2",
            cardSpec: "chara_card_v2",
            creator: "darkmountain",
            extensionKeys: ["janitor"],
            hasFirstMessage: true,
          }),
        }}
        onApply={() => undefined}
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Antonio 카드를 불러왔습니다.");
  });

  test("scenario setup shows imported card state for a cast slot", () => {
    const html = renderToStaticMarkup(
      <ScenarioSetupPanel
        scenarioList={["locked-room-mystery"]}
        isScenarioListLoading={false}
        scenarioListError={null}
        selectedScenario="locked-room-mystery"
        selectedScenarioDetail={makeScenarioDetail()}
        characterOverrides={{
          "kang-mujin": makeImportedCharacterCard({ name: "Antonio", role: "Imported Janitor card" }),
        }}
        characterLibrary={[]}
        error={null}
        onSelectScenario={() => undefined}
        onCharacterOverride={() => undefined}
        onCharacterOverrideClear={() => undefined}
        onNext={() => undefined}
      />,
    );

    expect(html).toContain("Antonio");
    expect(html).toContain("외부 카드 적용됨");
    expect(html).toContain("기본값으로 되돌리기");
  });

  test("scenario setup announces applied external card count", () => {
    const html = renderToStaticMarkup(
      <ScenarioSetupPanel
        scenarioList={["locked-room-mystery"]}
        isScenarioListLoading={false}
        scenarioListError={null}
        selectedScenario="locked-room-mystery"
        selectedScenarioDetail={makeScenarioDetail()}
        characterOverrides={{
          "kang-mujin": makeImportedCharacterCard({ name: "Antonio", role: "Imported Janitor card" }),
        }}
        characterLibrary={[]}
        error={null}
        onSelectScenario={() => undefined}
        onCharacterOverride={() => undefined}
        onCharacterOverrideClear={() => undefined}
        onNext={() => undefined}
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("외부 캐릭터 카드 1개 적용됨");
  });

  test("scenario setup explains empty reusable character-card library", () => {
    const html = renderToStaticMarkup(
      <ScenarioSetupPanel
        scenarioList={["locked-room-mystery"]}
        isScenarioListLoading={false}
        scenarioListError={null}
        selectedScenario="locked-room-mystery"
        selectedScenarioDetail={makeScenarioDetail()}
        characterOverrides={{}}
        characterLibrary={[]}
        error={null}
        onSelectScenario={() => undefined}
        onCharacterOverride={() => undefined}
        onCharacterOverrideClear={() => undefined}
        onNext={() => undefined}
      />,
    );

    expect(html).toContain("저장된 카드 0개");
    expect(html).toContain("PNG/JSON 캐릭터 카드를 가져오면 여기에 저장됩니다. 다음 세션에서도 다시 쓸 수 있습니다.");
  });

  test("persona preview exposes the default user name without hiding image selection copy", () => {
    const html = renderToStaticMarkup(
      <PersonaSetupPanel
        personaDraft={{ name: "", shortName: "", role: "", description: "", appearance: "", relationshipTags: [] }}
        personaPrompt=""
        relationshipTagText=""
        hasScenarioAdvisors={false}
        isStarting={false}
        isGeneratingPersona={false}
        isSavingPersona={false}
        error={null}
        personaGenerationError={null}
        libraryStatus={null}
        savedPersonaProfiles={[]}
        onDraftChange={() => undefined}
        onPersonaPromptChange={() => undefined}
        onRelationshipTagTextChange={() => undefined}
        onGeneratePersona={() => undefined}
        onSavePersona={() => undefined}
        onApplyPersonaProfile={() => undefined}
        onBack={() => undefined}
        onSubmit={(event) => event.preventDefault()}
      />,
    );

    expect(html).toContain("{{유저}}");
    expect(html).toContain("이미지 선택");
  });
});

function createMobileSession(): ClientSessionState {
  return {
    id: "session-mobile-settings",
    scenarioPackId: "school-life-anomaly",
    title: "학교생활",
    persona: {
      id: "user",
      name: "{{유저}}",
      shortName: "{{유저}}",
      role: "",
      mbti: "unspecified",
      relationshipTags: [],
    },
    scenario: {
      id: "school-life-anomaly",
      title: "학교생활",
      subtitle: "이상공간 단톡방",
      description: "",
      spaceRules: [],
      chatRules: [],
      toneRules: [],
      hardNos: [],
      backgroundIds: [],
      initialLocationId: "old-school-hallway",
      initialBackgroundId: "school-hallway",
      initialSceneMode: "messenger",
      uiMode: "messenger-first",
      interventionPrompt: "",
      openingBeats: [],
    },
    scene: {
      sessionId: "session-mobile-settings",
      scenarioId: "school-life-anomaly-chat",
      locationId: "old-school-hallway",
      backgroundId: "school-hallway",
      activeSpeakerId: null,
      tension: 3,
      danger: 2,
      turnNumber: 0,
      hasEnteredScene: true,
      recentSpeakerIds: [],
      relationships: {},
    },
    worldState: {
      sessionId: "session-mobile-settings",
      scenarioId: "school-life-anomaly-chat",
      sceneMode: "messenger",
      locationId: "old-school-hallway",
      backgroundId: "school-hallway",
      tension: 3,
      danger: 2,
      turnNumber: 0,
      hasEnteredScene: true,
      mainObjective: {
        id: "survive-and-escape",
        description: "이상공간 학교에서 살아남아 탈출구를 찾는다.",
        status: "active",
      },
      subObjectives: [],
      characterStates: {},
      relationshipGraph: [],
      recentEvents: [],
      recentSpeakerIds: [],
      sceneInertiaCounter: 0,
      recentBeatTypes: [],
      revealedCaseFacts: {},
      encounteredCharacters: {},
    },
    characters: [],
    messages: [],
    handouts: {},
    summaries: [],
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
    caseBoard: {
      isCaseScenario: false,
      clues: [],
      statements: [],
      contradictions: [],
      openQuestions: [],
      deductions: [],
      dossiers: [],
    },
  } as ClientSessionState;
}

function makeScenarioDetail(): V2ScenarioDetailResponse {
  return {
    manifest: {
      id: "locked-room-mystery",
      title: "Locked Room Mystery",
      subtitle: "폭설 속 밀실",
      genre: "mystery",
      version: "1.0.0",
    },
    scenarioCard: {
      title: "Locked Room Mystery",
      subtitle: "폭설 속 밀실",
      description: "산장 거실에서 모두가 서로를 의심한다.",
      interventionPrompt: "",
    },
    characters: [
      {
        id: "kang-mujin",
        name: "강무진",
        shortName: "무진",
        role: "형사",
        autonomy: 0.6,
      },
    ],
    mainObjective: {
      id: "find-culprit",
      description: "밀실의 범인을 밝혀낸다.",
    },
  };
}

function makeImportedCharacterCard(patch: Partial<ImportedCharacterCard> = {}): ImportedCharacterCard {
  return {
    id: "antonio",
    name: "Antonio",
    shortName: "Antonio",
    role: "Imported card",
    mbti: "unspecified",
    autonomy: 0.6,
    ocean: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
    systemPrompt: "You are Antonio.",
    handout: { secret: "", desire: "", objective: "", initialRelationshipToUser: 0 },
    relationships: [],
    ...patch,
  };
}

function makeSourceMetadata(patch: Partial<CharacterCardSourceMetadata> = {}): CharacterCardSourceMetadata {
  return {
    sourceFileName: "Antonio.png",
    sourceFormat: "png-chara-v2",
    cardSpec: "chara_card_v2",
    cardSpecVersion: "2.0",
    creator: "darkmountain",
    extensionKeys: ["janitor"],
    hasFirstMessage: true,
    alternateGreetingCount: 0,
    hasScenario: false,
    hasCharacterBook: false,
    ...patch,
  };
}
