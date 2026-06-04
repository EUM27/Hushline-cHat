import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  CaseBoardView,
  ModelConnection,
  ScenarioPack,
  SessionStateV2,
  TurnMessage,
  TurnResultV2,
} from "@hushline/shared";
import {
  countPhoneChannelMessages,
  getDefaultPhoneApp,
  getPhoneAppAvailability,
  type PhoneAppAvailability,
} from "../../../../client/src/utils/phone-apps";
import { toClientSession } from "../../app-v2/session-presenter";
import { buildCaseBoard } from "../../app-v2/case-board.js";
import { loadScenarioPack, createInitialWorldState } from "../index.js";
import { runTurnV2 } from "../pipeline";
import { assertNoHiddenTruthLeak, collectLeakSignals } from "./leak-harness";

const scenariosDir = resolve(import.meta.dir, "../../../scenarios");
const allScenarioPacks = loadAllScenarioPacks(scenariosDir);

const QUIET_DIRECTOR_OUTPUT = {
  speakers: [],
  silence: true,
  event: null,
  narratorInstruction: null,
  characterIntents: {},
  stateDelta: {},
  subObjectiveUpdate: null,
  relationshipUpdate: null,
  directives: [],
  delay: null,
};

interface PlaythroughStep {
  text: string;
  quiet?: boolean;
}

const LOCKED_ROOM_PLAYTHROUGH: PlaythroughStep[] = [
  { text: "*전화기와 끊긴 선, 라운지 테이블의 열쇠 위치를 확인한다*" },
  { text: "서로 이름과 역할부터 말해 주세요. 그다음 시신 발견 직전 어디에 있었는지도요." },
  { text: "정전이 일어난 순간, 각자 무엇을 보고 들었는지 시간순으로 말해 주세요." },
  { text: "라운지 테이블 위 열쇠를 처음 본 사람이 누구였는지부터 확인합시다." },
  { text: "나는 잠시 대답하지 않고 라운지 테이블과 현관문 쪽만 번갈아 본다.", quiet: true },
  { text: "대화를 멈추고 창문, 발코니 방향, 눈보라 소리만 차례로 확인한다.", quiet: true },
  { text: "*2층 서재 문, 창문 걸쇠, 책상 주변 바닥을 다시 확인한다*" },
  { text: "*서재의 책과 책장 배열, 빠진 책이 있는지 자세히 살펴본다*" },
  { text: "전화가 끊기기 전후에 누가 전화기 근처에 있었는지 공개된 것만 정리해 주세요." },
  { text: "방금 알리바이들 중 서로 맞지 않는 부분이 있는지 하나씩 대조합니다." },
  { text: "열쇠가 라운지 테이블에 나타난 경위를 지금 확인한 단서만으로 따져봅니다." },
  { text: "아직 결론은 내리지 않겠습니다. 각자 피해자를 마지막으로 본 시각만 다시 말해 주세요." },
];

const MESSENGER_PLAYTHROUGH: PlaythroughStep[] = [
  { text: "2학년 3반 팻말이 보여요. 지금 여기 누구 있어요?" },
  { text: "천장은 안 볼게요. 문 앞과 복도 바닥부터 확인합니다." },
  { text: "익명 1, 여기서 하면 안 되는 행동부터 짧게 알려 주세요." },
  { text: "단톡방 사람들, 각자 지금 어디에 있는지 말해 줄 수 있나요?" },
  { text: "잠깐 채팅을 멈추고 복도 소리만 듣는다.", quiet: true },
  { text: "아무 말 없이 휴대폰 화면의 새 공지와 주변 불빛만 확인한다.", quiet: true },
  { text: "방장 공지가 다시 뜨면 그대로 읽고, 움직이라는 말이 없으면 움직이지 않겠습니다." },
  { text: "구관 2층 복도에서 가장 가까운 교실 번호를 확인해요." },
  { text: "익명 7, 아까 숫자 1이 늘었다고 한 게 무슨 뜻인지 설명해 주세요." },
  { text: "다 같이 지금까지 확인된 규칙을 틀린 말 없이 정리해 주세요." },
  { text: "문 손잡이를 바로 잡지 않고, 먼저 문틈 아래를 살펴봅니다." },
  { text: "아직 못 본 건 못 본 걸로 두고, 확인한 것만 다음 행동으로 정리하겠습니다." },
];

const GENERIC_PLAYTHROUGH: PlaythroughStep[] = [
  { text: "현재 위치와 주변에서 바로 확인 가능한 것부터 살펴봅니다." },
  { text: "여기 있는 사람들에게 지금 알고 있는 것만 말해 달라고 합니다." },
  { text: "방금 들은 말 중 직접 확인하지 못한 내용은 보류하겠습니다." },
  { text: "가장 가까운 출입구와 위험한 물건이 있는지 확인합니다." },
  { text: "잠시 아무 말 없이 주변 소리만 듣는다.", quiet: true },
  { text: "대답하지 않고 조명과 바닥 흔적만 살핀다.", quiet: true },
  { text: "방금 확인한 변화가 있다면 공개된 사실만 정리합니다." },
  { text: "각자 마지막으로 본 장면을 시간순으로 말해 주세요." },
  { text: "서로 모순되는 말이 있는지 확인하겠습니다." },
  { text: "아직 결론은 내리지 않고, 직접 본 것만 남겨 둡니다." },
  { text: "다음으로 확인해야 할 장소를 하나만 고릅니다." },
  { text: "지금까지의 단서와 위험을 분리해서 정리합니다." },
];

let quietDirectorServer: ReturnType<typeof Bun.serve> | null = null;

afterAll(() => {
  quietDirectorServer?.stop(true);
  quietDirectorServer = null;
});

describe("scenario multi-turn playthrough integration", () => {
  test("covers every packaged scenario with a bounded 10-20 turn script", () => {
    expect(allScenarioPacks.length).toBeGreaterThan(0);

    for (const { pack } of allScenarioPacks) {
      const script = getPlaythroughScript(pack);
      expect(script.length).toBeGreaterThanOrEqual(10);
      expect(script.length).toBeLessThanOrEqual(20);
    }
  });

  for (const { id, pack } of allScenarioPacks) {
    test(`${id} completes a multi-turn dry/local playthrough without regressions`, async () => {
      const script = getPlaythroughScript(pack);
      const signals = collectLeakSignals(pack);
      let session = makePlaythroughSession(pack);
      let previousBoardMetrics = boardMetrics(buildCaseBoard(session, pack));
      const initialApps = projectPhoneApps(session, pack);
      const appHistory = [initialApps];
      let sceneBeatMessages = 0;

      for (const [index, step] of script.entries()) {
        const result = await runTurnV2(session, step.text, {
          scenarioPack: pack,
          ...(step.quiet ? { connections: { director: quietDirectorConnection() } } : {}),
        });
        session = withTurn(session, result);

        const board = buildCaseBoard(session, pack);
        assertNoHiddenTruthLeak({ scenarioId: id, input: step.text, result, board, signals });

        const nextMetrics = boardMetrics(board);
        assertBoardDidNotRegress(id, index + 1, previousBoardMetrics, nextMetrics);
        previousBoardMetrics = nextMetrics;

        sceneBeatMessages += result.messages.filter((message) => message.speakerLabel === "[장면]").length;
        appHistory.push(projectPhoneApps(session, pack));

        expect(session.worldState.turnNumber).toBe(index + 1);
        expect(result.messages.length).toBeGreaterThan(0);
      }

      const finalBoard = buildCaseBoard(session, pack);
      const finalApps = appHistory.at(-1)!;

      if (pack.characters.length > 0) {
        expect(finalBoard.dossiers.length).toBeGreaterThan(0);
      }

      if (finalBoard.isCaseScenario) {
        expect(finalBoard.clues.length).toBeGreaterThan(0);
        expect(finalApps.casefile).toBe(true);
      }
      if (finalApps.casefile && finalApps.messenger) {
        expect(finalApps.showDock).toBe(true);
      }

      if (pack.manifest.uiMode === "messenger-first") {
        expect(initialApps.messenger).toBe(true);
        expect(initialApps.defaultApp).toBe("messenger");
      } else {
        const finalPhoneChannelCount = countPhoneChannelMessages(session.messages);
        expect(appHistory.some((availability) => availability.messenger)).toBe(finalPhoneChannelCount > 0);
      }

      if ((pack.sceneDevices?.length ?? 0) > 0) {
        expect(sceneBeatMessages).toBeGreaterThan(0);
        expect(session.worldState.recentEvents.some((event) => event.description.includes("[scene-beat:"))).toBe(true);
      }
    });
  }
});

function loadAllScenarioPacks(scenarioRoot: string): Array<{ id: string; pack: ScenarioPack }> {
  if (!existsSync(scenarioRoot)) return [];

  const packs: Array<{ id: string; pack: ScenarioPack }> = [];
  for (const entry of readdirSync(scenarioRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const scenarioDir = join(scenarioRoot, entry.name);
    if (!existsSync(join(scenarioDir, "manifest.json"))) continue;
    const loaded = loadScenarioPack(scenarioDir);
    if (!loaded.success) {
      throw new Error(`Scenario pack failed to load for playthrough test: ${entry.name}`);
    }
    packs.push({ id: entry.name, pack: loaded.pack });
  }

  return packs.sort((left, right) => left.id.localeCompare(right.id));
}

function getPlaythroughScript(pack: ScenarioPack): PlaythroughStep[] {
  if (pack.manifest.id === "locked-room-mystery") return LOCKED_ROOM_PLAYTHROUGH;
  if (pack.manifest.uiMode === "messenger-first") return MESSENGER_PLAYTHROUGH;
  return GENERIC_PLAYTHROUGH;
}

function makePlaythroughSession(pack: ScenarioPack): SessionStateV2 {
  const sessionId = `playthrough-${pack.manifest.id}`;
  const personaName = "탐정";
  return {
    id: sessionId,
    scenarioPackId: pack.manifest.id,
    title: pack.manifest.title,
    persona: { id: "user", name: personaName, shortName: personaName },
    worldState: createInitialWorldState(sessionId, pack),
    characters: pack.characters,
    messages: pack.scenarioCard.openingBeats.map((beat): TurnMessage => ({
      id: `opening-${beat.id}`,
      sessionId,
      role: beat.role,
      content: resolveUserLabel(beat.content, personaName),
      speakerKind: beat.speakerKind,
      speakerLabel: resolveUserLabel(beat.speakerLabel, personaName),
      isOpeningBeat: true,
      createdAt: new Date().toISOString(),
    })),
    handouts: {},
    summaries: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function resolveUserLabel(value: string, personaName: string): string {
  return value.replaceAll("{{유저}}", personaName);
}

function withTurn(session: SessionStateV2, result: TurnResultV2): SessionStateV2 {
  return {
    ...session,
    worldState: result.worldState,
    messages: [...session.messages, ...result.messages],
    updatedAt: new Date().toISOString(),
  };
}

function quietDirectorConnection(): ModelConnection {
  if (!quietDirectorServer) {
    quietDirectorServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname !== "/chat/completions") {
          return new Response("Not found", { status: 404 });
        }
        return Response.json({
          choices: [{ message: { content: JSON.stringify(QUIET_DIRECTOR_OUTPUT) } }],
        });
      },
    });
  }

  return {
    providerId: "openrouter",
    apiKey: "local-test-key",
    model: "quiet-director",
    baseUrl: `http://127.0.0.1:${quietDirectorServer.port}`,
  };
}

interface BoardMetrics {
  clues: number;
  statements: number;
  contradictions: number;
  openQuestions: number;
  deductions: number;
  dossiers: number;
}

function boardMetrics(board: CaseBoardView): BoardMetrics {
  return {
    clues: board.clues.length,
    statements: board.statements.length,
    contradictions: board.contradictions.length,
    openQuestions: board.openQuestions.length,
    deductions: board.deductions.length,
    dossiers: board.dossiers.length,
  };
}

function assertBoardDidNotRegress(
  scenarioId: string,
  turn: number,
  previous: BoardMetrics,
  next: BoardMetrics,
): void {
  for (const key of Object.keys(previous) as Array<keyof BoardMetrics>) {
    if (next[key] < previous[key]) {
      throw new Error(
        `${scenarioId} caseBoard regressed at turn ${turn}: ${key} ${previous[key]} -> ${next[key]}`,
      );
    }
  }
}

type ProjectedPhoneApps = PhoneAppAvailability & {
  defaultApp: "casefile" | "messenger";
};

function projectPhoneApps(session: SessionStateV2, pack: ScenarioPack): ProjectedPhoneApps {
  const clientSession = toClientSession(session, pack);
  const uiMode = clientSession.scenario.uiMode ?? "scene-first";
  const availability = getPhoneAppAvailability(
    clientSession.caseBoard,
    uiMode,
    countPhoneChannelMessages(session.messages),
  );

  return {
    ...availability,
    defaultApp: getDefaultPhoneApp(availability, uiMode),
  };
}
