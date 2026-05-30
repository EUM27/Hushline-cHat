export function stripAnonymousBrackets(label: string): string {
  return label.replace(/^\[/, "").replace(/\]$/, "").trim();
}

export function resolveUserLabel(label: string, personaName: string): string {
  return label
    .replaceAll("{{유저}}", personaName)
    .replaceAll("{{user}}", personaName);
}

export function nonEmpty(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function cleanStringArray(values?: string[]): string[] {
  return uniqueStrings((values ?? []).map((value) => value.trim()).filter(Boolean));
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function truncateForPrompt(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}...` : trimmed;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
