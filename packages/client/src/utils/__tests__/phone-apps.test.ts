import { describe, expect, test } from "bun:test";
import type { CaseBoardView } from "@hushline/shared";
import {
  caseFileSignature,
  getDefaultPhoneApp,
  getPhoneAppAvailability,
  shouldOpenMessengerForLatestOutgoingMessage,
} from "../phone-apps";

function caseBoard(over: Partial<CaseBoardView> = {}): CaseBoardView {
  return {
    isCaseScenario: false,
    clues: [],
    statements: [],
    contradictions: [],
    openQuestions: [],
    deductions: [],
    dossiers: [],
    ...over,
  };
}

describe("phone app availability", () => {
  test("mystery scenario with no messenger messages → case file only, no dock", () => {
    const a = getPhoneAppAvailability(caseBoard({ isCaseScenario: true }), "scene-first", 0);
    expect(a.casefile).toBe(true);
    expect(a.messenger).toBe(false);
    expect(a.showDock).toBe(false);
    expect(a.available).toEqual(["casefile"]);
  });

  test("messenger-first scenario with no case → messenger only", () => {
    const a = getPhoneAppAvailability(caseBoard(), "messenger-first", 0);
    expect(a.casefile).toBe(false);
    expect(a.messenger).toBe(true);
    expect(a.available).toEqual(["messenger"]);
  });

  test("case scenario that has produced messenger messages → both apps + dock", () => {
    const a = getPhoneAppAvailability(caseBoard({ isCaseScenario: true }), "scene-first", 3);
    expect(a.casefile).toBe(true);
    expect(a.messenger).toBe(true);
    expect(a.showDock).toBe(true);
    expect(a.available).toEqual(["casefile", "messenger"]);
  });

  test("dossiers alone make the case file available", () => {
    const a = getPhoneAppAvailability(
      caseBoard({ dossiers: [{ characterId: "x", displayName: "X", role: "", surfaceTags: [], relationshipToUser: 0, revealed: false, statementIds: [] }] }),
      "scene-first",
      0,
    );
    expect(a.casefile).toBe(true);
  });

  test("nothing available → no apps", () => {
    const a = getPhoneAppAvailability(undefined, "scene-first", 0);
    expect(a.available).toEqual([]);
    expect(a.showDock).toBe(false);
  });
});

describe("default phone app", () => {
  test("messenger-first opens messenger when available", () => {
    const a = getPhoneAppAvailability(caseBoard({ isCaseScenario: true }), "messenger-first", 2);
    expect(getDefaultPhoneApp(a, "messenger-first")).toBe("messenger");
  });

  test("non-messenger-first prefers the case file", () => {
    const a = getPhoneAppAvailability(caseBoard({ isCaseScenario: true }), "scene-first", 2);
    expect(getDefaultPhoneApp(a, "scene-first")).toBe("casefile");
  });

  test("falls back to messenger when case file unavailable", () => {
    const a = getPhoneAppAvailability(caseBoard(), "hybrid", 1);
    expect(getDefaultPhoneApp(a, "hybrid")).toBe("messenger");
  });

  test("empty-state fallback is the case file", () => {
    const a = getPhoneAppAvailability(undefined, "scene-first", 0);
    expect(getDefaultPhoneApp(a, "scene-first")).toBe("casefile");
  });
});

describe("phone app focus after outgoing chat", () => {
  test("opens messenger when the latest visible message is the user's phone chat", () => {
    const availability = getPhoneAppAvailability(caseBoard({ isCaseScenario: true }), "scene-first", 1);

    expect(shouldOpenMessengerForLatestOutgoingMessage("casefile", availability, {
      id: "user-1",
      sessionId: "session-1",
      role: "user",
      content: "내 말 보여?",
      inputMode: "chat",
      createdAt: "2026-05-25T00:00:01.000Z",
    })).toBe(true);
  });

  test("does not steal focus for non-phone scene actions", () => {
    const availability = getPhoneAppAvailability(caseBoard({ isCaseScenario: true }), "scene-first", 1);

    expect(shouldOpenMessengerForLatestOutgoingMessage("casefile", availability, {
      id: "user-1",
      sessionId: "session-1",
      role: "user",
      content: "문 쪽으로 걸어간다.",
      inputMode: "action",
      createdAt: "2026-05-25T00:00:01.000Z",
    })).toBe(false);
  });
});

describe("case file signature", () => {
  test("sums clues, contradictions, and deductions", () => {
    const sig = caseFileSignature(caseBoard({
      clues: [{ id: "c1", text: "", source: "public", tags: [], knownSinceTurn: 0 }],
      contradictions: [{ id: "x1", conflictType: "t", statementIds: [], detectedAtTurn: 1, severity: 1 }],
      deductions: [{ id: "d1", turn: 1, claim: "", verdict: "insufficient", score: 0 }],
    }));
    expect(sig).toBe(3);
  });

  test("undefined board → 0", () => {
    expect(caseFileSignature(undefined)).toBe(0);
  });
});
