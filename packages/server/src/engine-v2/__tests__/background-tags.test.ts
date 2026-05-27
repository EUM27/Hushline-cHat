import { describe, expect, test } from "bun:test";
import { parseBackgroundTags } from "../background-tags";

const lodgeBackgrounds = [
  "lodge-foyer",
  "lodge-dining-room",
  "lodge-upstairs-hallway",
  "lodge-study-door",
  "lodge-study-crime-scene",
  "lodge-maintenance-room",
  "lodge-exterior-storm",
  "lodge-exterior-drive",
];

describe("background tag parser", () => {
  test("strips a known direct background tag and returns its id", () => {
    const parsed = parseBackgroundTags("[bg:lodge-study-crime-scene]\n피 냄새가 서재에 가라앉아 있다.", lodgeBackgrounds);

    expect(parsed.backgroundId).toBe("lodge-study-crime-scene");
    expect(parsed.content).toBe("피 냄새가 서재에 가라앉아 있다.");
  });

  test("resolves Korean aliases without leaking the tag into chat text", () => {
    const parsed = parseBackgroundTags("[배경: 보일러실]\n낡은 배관 안쪽에서 낮은 진동이 울린다.", lodgeBackgrounds);

    expect(parsed.backgroundId).toBe("lodge-maintenance-room");
    expect(parsed.content).toBe("낡은 배관 안쪽에서 낮은 진동이 울린다.");
  });

  test("keeps unknown tags visible instead of guessing a background", () => {
    const parsed = parseBackgroundTags("[bg:unknown-room]\n문이 하나 더 있다.", lodgeBackgrounds);

    expect(parsed.backgroundId).toBeNull();
    expect(parsed.content).toBe("[bg:unknown-room]\n문이 하나 더 있다.");
  });
});
