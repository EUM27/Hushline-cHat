import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { SessionStateV2, TurnResultV2 } from "@hushline/shared";
import { runTurnV2 } from "../pipeline";
import { buildCaseBoard } from "../../app-v2/case-board.js";
import { ADVERSARIAL_INPUTS } from "./adversarial-inputs";
import {
  assertNoHiddenTruthLeak,
  collectLeakSignals,
  loadCasePacks,
  makeHarnessSession,
  REDACTION_TOKEN,
} from "./leak-harness";

const scenariosDir = resolve(import.meta.dir, "../../../scenarios");
const casePacks = loadCasePacks(scenariosDir);

describe("hidden-truth leak harness", () => {
  test("at least one case scenario with hidden truths is covered", () => {
    expect(casePacks.length).toBeGreaterThan(0);
  });

  // High-risk inquiry types must each be provoked by the corpus.
  test("corpus covers all high-risk inquiry targets", () => {
    const targets = new Set(ADVERSARIAL_INPUTS.map((input) => input.targets));
    for (const required of ["truth_request", "deduction_attempt", "contradiction_challenge", "accusation"]) {
      expect(targets.has(required as never)).toBe(true);
    }
  });

  for (const { id, pack } of casePacks) {
    const signals = collectLeakSignals(pack);

    describe(id, () => {
      test("single-turn adversarial inputs never leak hidden truth", async () => {
        for (const input of ADVERSARIAL_INPUTS) {
          const session = makeHarnessSession(pack);
          const result = await runTurnV2(session, input.text, { scenarioPack: pack });
          const board = buildCaseBoard(withTurn(session, result), pack);
          assertNoHiddenTruthLeak({ scenarioId: id, input: input.text, result, board, signals });
        }
      });

      test("cumulative adversarial session never leaks hidden truth", async () => {
        let session = makeHarnessSession(pack);
        for (const input of ADVERSARIAL_INPUTS) {
          const result = await runTurnV2(session, input.text, { scenarioPack: pack });
          session = withTurn(session, result);
          const board = buildCaseBoard(session, pack);
          assertNoHiddenTruthLeak({ scenarioId: id, input: input.text, result, board, signals });
        }
      });
    });
  }

  // Self-verification: the harness must actually catch an injected leak.
  test("assertNoHiddenTruthLeak detects an injected hidden-truth leak", () => {
    const { pack } = casePacks[0]!;
    const signals = collectLeakSignals(pack);
    const leakedId = signals.ids[0]!;

    const fakeResult = {
      worldState: makeHarnessSession(pack).worldState,
      messages: [
        {
          id: "m1",
          sessionId: "x",
          role: "narrator" as const,
          content: `사실 범인은 ${leakedId} 였다.`,
          createdAt: new Date().toISOString(),
        },
      ],
      directorOutput: {} as never,
      boundaryReport: { corrected: false, violations: [] },
      stateLaw: {} as never,
    } satisfies Partial<TurnResultV2> as TurnResultV2;

    const emptyBoard = buildCaseBoard(makeHarnessSession(pack), pack);

    expect(() =>
      assertNoHiddenTruthLeak({
        scenarioId: "self-test",
        input: "inject",
        result: fakeResult,
        board: emptyBoard,
        signals,
      }),
    ).toThrow();
  });

  // Self-verification: the redaction token must also be caught.
  test("assertNoHiddenTruthLeak detects the redaction token", () => {
    const { pack } = casePacks[0]!;
    const signals = collectLeakSignals(pack);

    const fakeResult = {
      worldState: makeHarnessSession(pack).worldState,
      messages: [
        {
          id: "m1",
          sessionId: "x",
          role: "narrator" as const,
          content: `누군가 중얼거린다: ${REDACTION_TOKEN}`,
          createdAt: new Date().toISOString(),
        },
      ],
      directorOutput: {} as never,
      boundaryReport: { corrected: false, violations: [] },
      stateLaw: {} as never,
    } satisfies Partial<TurnResultV2> as TurnResultV2;

    const emptyBoard = buildCaseBoard(makeHarnessSession(pack), pack);

    expect(() =>
      assertNoHiddenTruthLeak({
        scenarioId: "self-test",
        input: "inject",
        result: fakeResult,
        board: emptyBoard,
        signals,
      }),
    ).toThrow();
  });
});

function withTurn(session: SessionStateV2, result: TurnResultV2): SessionStateV2 {
  return {
    ...session,
    worldState: result.worldState,
    messages: [...session.messages, ...result.messages],
  };
}
