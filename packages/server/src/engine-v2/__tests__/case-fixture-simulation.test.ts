import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { CaseInquiryType, InputMode, ScenarioPack, SessionStateV2, TurnResultV2 } from "@hushline/shared";
import { buildCaseBoard } from "../../app-v2/case-board.js";
import { loadScenarioPack } from "../scenario-loader";
import { runTurnV2 } from "../pipeline";
import { assertNoHiddenTruthLeak, collectLeakSignals, makeHarnessSession } from "./leak-harness";

const fixtures: Array<{
  name: string;
  turns: Array<{
    text: string;
    inputMode?: InputMode;
    expectInquiry: CaseInquiryType;
  }>;
}> = [
  {
    name: "key timeline contradiction",
    turns: [
      { text: "열쇠는 정전 전에 어디 있었어?", expectInquiry: "timeline_query" },
      { text: "정전 뒤에도 테이블에 있었다는 말이 맞아?", expectInquiry: "object_query" },
      { text: "잠깐, 둘 말이 모순되잖아.", expectInquiry: "contradiction_challenge" },
    ],
  },
  {
    name: "book object inspection",
    turns: [
      { text: "*윤서하의 책 꾸러미와 책등 얼룩을 살펴본다*", inputMode: "action", expectInquiry: "object_query" },
      { text: "윤서하, 그 책 꾸러미는 왜 가져왔는지 말해 줘.", expectInquiry: "witness_testimony" },
      { text: "책등 안쪽에 젖은 흔적이 있었는지 확인합니다.", inputMode: "action", expectInquiry: "object_query" },
    ],
  },
  {
    name: "deduction attempt stays bounded",
    turns: [
      { text: "정전 전에 열쇠가 테이블에 있었으니 누군가 정전 중 가져간 거야.", expectInquiry: "deduction_attempt" },
      { text: "그러니까 누군가 정전 중에 열쇠를 옮긴 거야.", expectInquiry: "deduction_attempt" },
      { text: "그게 바로 범인 정체를 말해준다는 뜻은 아니고, 근거가 더 필요해.", expectInquiry: "deduction_attempt" },
    ],
  },
];

describe("locked-room fixture simulation", () => {
  for (const fixture of fixtures) {
    test(`${fixture.name} keeps inquiry routing and leak boundaries stable`, async () => {
      const pack = loadLockedRoomPack();
      const signals = collectLeakSignals(pack);
      let session = makeHarnessSession(pack);

      for (const step of fixture.turns) {
        const result = await runTurnV2(session, step.text, {
          scenarioPack: pack,
          ...(step.inputMode ? { inputMode: step.inputMode } : {}),
        });
        session = withTurn(session, result);
        const board = buildCaseBoard(session, pack);

        expect(result.caseRuntime?.inquiry.inquiryType).toBe(step.expectInquiry);
        assertNoHiddenTruthLeak({
          scenarioId: pack.manifest.id,
          input: step.text,
          result,
          board,
          signals,
        });
      }
    });
  }
});

function loadLockedRoomPack(): ScenarioPack {
  const loaded = loadScenarioPack(resolve(import.meta.dir, "../../../scenarios/locked-room-mystery"));
  if (!loaded.success) {
    throw new Error(`failed to load locked-room-mystery: ${loaded.errors.join(", ")}`);
  }
  return loaded.pack;
}

function withTurn(session: SessionStateV2, result: TurnResultV2): SessionStateV2 {
  return {
    ...session,
    worldState: result.worldState,
    messages: [...session.messages, ...result.messages],
    updatedAt: new Date().toISOString(),
  };
}
