export interface CharacterCardTargetRef {
  current: string | null;
}

export function beginCharacterCardImport(
  targetRef: CharacterCardTargetRef,
  characterId: string,
  openPicker: () => void,
) {
  targetRef.current = characterId;
  openPicker();
}
