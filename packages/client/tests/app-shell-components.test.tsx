import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppToolStrip } from "../src/components/AppToolStrip";
import { PhoneSubScreen } from "../src/components/PhoneSubScreen";
import { ScenarioShell } from "../src/components/ScenarioShell";
import { AdvisorSetupPanel } from "../src/components/setup/AdvisorSetupPanel";
import { PersonaSetupPanel } from "../src/components/setup/PersonaSetupPanel";
import { ScenarioSetupPanel } from "../src/components/setup/ScenarioSetupPanel";
import { visualThemePresets } from "../src/constants/theme-presets";
import type { ClientSessionState } from "@hushline/shared";

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
