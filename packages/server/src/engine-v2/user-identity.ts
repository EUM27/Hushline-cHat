import type { TurnMessage } from "@hushline/shared";

const USER_PLACEHOLDERS = new Set(["{{user}}", "{{유저}}"]);

export function normalizePersonaName(personaName: string | undefined): string {
  return personaName?.trim() ?? "";
}

export function isPlaceholderPersonaName(personaName: string | undefined): boolean {
  const normalized = normalizePersonaName(personaName);
  return !normalized || USER_PLACEHOLDERS.has(normalized);
}

export function hasUserIntroducedName(
  messages: TurnMessage[],
  personaName: string | undefined,
  currentUserInput = "",
): boolean {
  const name = normalizePersonaName(personaName);
  if (isPlaceholderPersonaName(name) || compactIdentityText(name).length < 2) {
    return false;
  }

  const publicUserTexts = [
    ...messages
      .filter((message) => message.role === "user")
      .map((message) => message.content),
    currentUserInput,
  ];

  return publicUserTexts.some((text) => isExplicitSelfIntroduction(text, name));
}

export function maskUnintroducedUserName(
  value: string,
  personaName: string | undefined,
  nameIntroduced: boolean,
  replacement: string,
): string {
  const name = normalizePersonaName(personaName);
  if (nameIntroduced || isPlaceholderPersonaName(name) || compactIdentityText(name).length < 2) {
    return value;
  }
  return value.replace(new RegExp(`${escapeRegExp(name)}\\s*(?:씨|님)?`, "gu"), replacement);
}

export function containsUnintroducedUserName(
  value: string,
  personaName: string | undefined,
  nameIntroduced: boolean,
): boolean {
  const name = normalizePersonaName(personaName);
  if (nameIntroduced || isPlaceholderPersonaName(name) || compactIdentityText(name).length < 2) {
    return false;
  }
  return compactIdentityText(value).includes(compactIdentityText(name));
}

function isExplicitSelfIntroduction(text: string, personaName: string): boolean {
  const compactText = compactIdentityText(text);
  const compactName = compactIdentityText(personaName);
  if (!compactText || !compactName) return false;

  return [
    `제이름은${compactName}`,
    `내이름은${compactName}`,
    `나는${compactName}`,
    `저는${compactName}`,
    `제가${compactName}`,
    `${compactName}입니다`,
    `${compactName}이에요`,
    `${compactName}예요`,
    `${compactName}라고합니다`,
    `${compactName}이라고합니다`,
    `${compactName}라불러`,
    `${compactName}라고불러`,
    `${compactName}이라고불러`,
    `callme${compactName}`,
    `iam${compactName}`,
    `i'm${compactName}`,
  ].some((marker) => compactText.includes(marker));
}

function compactIdentityText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[“”"']/g, "")
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
