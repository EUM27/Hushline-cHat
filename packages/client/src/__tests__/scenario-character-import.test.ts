import { expect, test } from "bun:test";
import { beginCharacterCardImport } from "../components/setup/character-card-target";

test("records the character slot before opening the card picker", () => {
  const targetRef: { current: string | null } = { current: null };
  let targetSeenWhenPickerOpened: string | null = null;

  beginCharacterCardImport(targetRef, "kang-mujin", () => {
    targetSeenWhenPickerOpened = targetRef.current;
  });

  expect(targetSeenWhenPickerOpened).toBe("kang-mujin");
});
