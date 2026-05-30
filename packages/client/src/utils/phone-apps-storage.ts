// ──────────────────────────────────────────────
// Phone Device — per-session "seen" state (unread tracking)
// ──────────────────────────────────────────────

import type { PhoneAppId } from "./phone-apps";

export interface PhoneAppsSeenState {
  /** Last phone-channel message count the player has seen. */
  seenMessenger: number;
  /** Last case-file signature the player has seen. */
  seenCasefile: number;
  /** Last app the player viewed. */
  lastApp?: PhoneAppId;
}

const DEFAULT_STATE: PhoneAppsSeenState = { seenMessenger: 0, seenCasefile: 0 };

function storageKey(sessionId: string): string {
  return `hushline.phoneApps.${sessionId}`;
}

export function loadPhoneAppsSeen(sessionId: string): PhoneAppsSeenState {
  if (!sessionId || typeof localStorage === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<PhoneAppsSeenState>;
    return {
      seenMessenger: typeof parsed.seenMessenger === "number" ? parsed.seenMessenger : 0,
      seenCasefile: typeof parsed.seenCasefile === "number" ? parsed.seenCasefile : 0,
      ...(parsed.lastApp === "casefile" || parsed.lastApp === "messenger" ? { lastApp: parsed.lastApp } : {}),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function savePhoneAppsSeen(sessionId: string, state: PhoneAppsSeenState): void {
  if (!sessionId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(state));
  } catch {
    // ignore quota / serialization errors
  }
}
