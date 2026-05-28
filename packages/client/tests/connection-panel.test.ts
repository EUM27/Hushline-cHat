import { describe, expect, test } from "bun:test";
import { resolveConnectionSlotKey } from "../src/components/ConnectionPanel";

describe("resolveConnectionSlotKey", () => {
  test("keeps an existing slot selection inside the connection panel", () => {
    expect(resolveConnectionSlotKey([
      { key: "default", title: "기본 연결", subtitle: "전체 폴백" },
      { key: "director", title: "Director", subtitle: "세계의 의지" },
    ], "director")).toBe("director");
  });

  test("falls back when the selected slot disappears after scenario changes", () => {
    expect(resolveConnectionSlotKey([
      { key: "default", title: "기본 연결", subtitle: "전체 폴백" },
    ], "yoon-seha")).toBe("default");
  });
});
