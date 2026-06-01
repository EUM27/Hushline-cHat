import type { ClientSessionState } from "@hushline/shared";

export type SessionShellMode = "invitation-open" | "messenger-open" | "scene-open";

export function getSessionShellMode(session: ClientSessionState): SessionShellMode {
  if (session.scene.hasEnteredScene && session.scenario.uiMode !== "messenger-first") {
    return "scene-open";
  }

  if (session.scene.turnNumber === 0) {
    return "invitation-open";
  }

  return session.scene.hasEnteredScene ? "scene-open" : "messenger-open";
}
