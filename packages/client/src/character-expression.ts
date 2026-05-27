import type { ExpressionId } from "@hushline/shared";

export type CharacterExpressionPose =
  | "neutral"
  | "happy"
  | "sad"
  | "thinking"
  | "surprised"
  | "worried"
  | "angry";

const expressionAliases: Record<string, CharacterExpressionPose> = {
  neutral: "neutral",
  happy: "happy",
  smile: "happy",
  smiling: "happy",
  sad: "sad",
  thinking: "thinking",
  serious: "thinking",
  surprised: "surprised",
  surprise: "surprised",
  worried: "worried",
  anxious: "worried",
  angry: "angry",
};

export function resolveCharacterExpressionPose(
  expression: ExpressionId | string | null | undefined,
): CharacterExpressionPose {
  const key = expression?.trim().toLowerCase();
  if (!key) {
    return "neutral";
  }
  return expressionAliases[key] ?? "neutral";
}
