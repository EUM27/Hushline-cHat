import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveConnectionSlotKey } from "../src/components/ConnectionPanel";
import { ConnectionPanel } from "../src/components/ConnectionPanel";

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

describe("ConnectionPanel", () => {
  test("renders a provider connection test action", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionPanel, {
        profiles: [
          {
            id: "openrouter",
            label: "OpenRouter",
            baseUrl: "https://openrouter.ai/api/v1",
            endpointPath: "/chat/completions",
            docsUrl: "https://openrouter.ai/docs/api-reference/chat-completion",
          },
        ],
        slots: [{ key: "default", title: "기본 연결", subtitle: "전체 폴백" }],
        connections: {
          default: {
            providerId: "openrouter",
            apiKey: "test-key",
            model: "test/model",
          },
        },
        modelOptions: {},
        modelLoadState: {},
        oauthStatus: null,
        saveStatus: "브라우저에 자동 저장됨",
        onChange: () => undefined,
        onLoadModels: () => undefined,
        onOpenChatGptLogin: () => undefined,
        onCheckChatGptAccount: () => undefined,
        onSave: () => undefined,
      }),
    );

    expect(html).toContain("연결 테스트");
  });
});
