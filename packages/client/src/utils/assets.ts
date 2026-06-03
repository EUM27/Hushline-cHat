import type { AssetManifest, CharacterProfile, ChatMessage } from "@hushline/shared";

export function formatKoreanTime(): string {
  return new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function findBackgroundUrl(assets: AssetManifest | null, backgroundId?: string): string {
  if (!backgroundId) return "none";
  const found = assets?.backgrounds.find((background) => background.id === backgroundId)?.url;
  return found ? `url("${found}")` : "none";
}

export function findSpriteUrl(
  assets: AssetManifest | null,
  characterId: string | undefined,
  expression: ChatMessage["expression"] | undefined,
): string | null {
  if (!characterId) return null;

  const matchingExpression = expression
    ? assets?.sprites.find((sprite) =>
        sprite.characterId === characterId && sprite.expression === expression && sprite.fullBody,
      )
    : null;
  const fallback = assets?.sprites.find((sprite) => sprite.characterId === characterId && sprite.fullBody);
  return matchingExpression?.url ?? fallback?.url ?? null;
}

export function findCharacterSpriteUrl(
  assets: AssetManifest | null,
  character: Pick<CharacterProfile, "spriteSetId"> | undefined,
  expression: ChatMessage["expression"] | undefined,
): string | null {
  if (!character) return null;
  return findSpriteUrl(assets, character.spriteSetId, expression);
}
