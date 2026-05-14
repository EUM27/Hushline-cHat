// ──────────────────────────────────────────────
// Engine v2 — Input Classifier
// ──────────────────────────────────────────────
// Detects InputMode from text conventions and strips markers.
// UI toggle takes priority; text detection is secondary path.
// ──────────────────────────────────────────────

import type { InputMode } from "@hushline/shared";

export interface ClassifiedInput {
  mode: InputMode;
  content: string;
}

/**
 * Classify user input and strip convention markers.
 * If explicitMode is provided (from UI toggle), it takes priority.
 */
export function classifyInput(raw: string, explicitMode?: InputMode): ClassifiedInput {
  const trimmed = raw.trim();
  const mode = explicitMode ?? detectInputMode(trimmed);
  const content = stripInputModePrefix(trimmed, mode);
  return { mode, content };
}

// ── Detection ──

const ACTION_PATTERNS = [
  /^\*[^*]+\*$/,   // *행동*
  /^\/\//,         // //행동
  /^\/me\s/i,      // /me 행동
];

const WHISPER_PATTERNS = [
  /^\(+[^)]+\)+$/,   // (혼잣말) 또는 ((혼잣말))
  /^\[혼잣말\]/,
  /^\[독백\]/,
  /^\[내면\]/,
];

export function detectInputMode(raw: string): InputMode {
  const trimmed = raw.trim();
  if (ACTION_PATTERNS.some((p) => p.test(trimmed))) return "action";
  if (WHISPER_PATTERNS.some((p) => p.test(trimmed))) return "whisper";
  return "chat";
}

// ── Stripping ──

export function stripInputModePrefix(raw: string, mode: InputMode): string {
  const trimmed = raw.trim();

  if (mode === "action") {
    if (/^\*[^*]+\*$/.test(trimmed)) return trimmed.slice(1, -1).trim();
    if (/^\/\//.test(trimmed)) return trimmed.slice(2).trim();
    if (/^\/me\s/i.test(trimmed)) return trimmed.replace(/^\/me\s+/i, "").trim();
  }

  if (mode === "whisper") {
    if (/^\(+([^)]+)\)+$/.test(trimmed)) {
      return trimmed.replace(/^\(+/, "").replace(/\)+$/, "").trim();
    }
    if (/^\[(혼잣말|독백|내면)\]/.test(trimmed)) {
      return trimmed.replace(/^\[[^\]]+\]\s*/, "").trim();
    }
  }

  return trimmed;
}
