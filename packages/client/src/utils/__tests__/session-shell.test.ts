import { describe, expect, test } from "bun:test";
import type { ClientSessionState } from "@hushline/shared";
import { getSessionShellMode } from "../session-shell";

describe("session shell mode", () => {
  test("uses scene-open for scene-first sessions that have already entered the scene on turn zero", () => {
    expect(
      getSessionShellMode({
        scenario: { uiMode: "scene-first" },
        scene: {
          hasEnteredScene: true,
          turnNumber: 0,
        },
      } as ClientSessionState),
    ).toBe("scene-open");
  });

  test("keeps messenger-first turn zero sessions in invitation mode", () => {
    expect(
      getSessionShellMode({
        scenario: { uiMode: "messenger-first" },
        scene: {
          hasEnteredScene: false,
          turnNumber: 0,
        },
      } as ClientSessionState),
    ).toBe("invitation-open");
  });
});
