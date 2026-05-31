import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConnectionPanel,
  getConnectionTestBlockedReason,
  resolveConnectionSlotKey,
} from "../src/components/ConnectionPanel";

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
    const html = renderConnectionPanel({
      apiKey: "test-key",
      model: "test/model",
    });

    expect(html).toContain("연결 테스트");
  });

  test("shows why a provider connection test is blocked without an API key", () => {
    const html = renderConnectionPanel({
      apiKey: "",
      model: "test/model",
    });

    expect(html).toContain("API key를 먼저 입력해야 테스트할 수 있습니다.");
  });
});

describe("getConnectionTestBlockedReason", () => {
  test("requires a model before testing the connection", () => {
    expect(getConnectionTestBlockedReason({
      model: "",
      usesChatGptOAuth: false,
      effectiveApiKey: "test-key",
    })).toBe("모델을 먼저 선택하거나 직접 입력해야 테스트할 수 있습니다.");
  });

  test("requires a checked ChatGPT OAuth account before testing", () => {
    expect(getConnectionTestBlockedReason({
      model: "gpt-4o",
      usesChatGptOAuth: true,
      effectiveApiKey: "",
      chatGptOAuthChecked: true,
      chatGptOAuthConnected: false,
    })).toBe("ChatGPT 로그인을 먼저 완료해야 테스트할 수 있습니다.");
  });

  test("allows OAuth-backed providers only after account confirmation", () => {
    expect(getConnectionTestBlockedReason({
      model: "gpt-4o",
      usesChatGptOAuth: true,
      effectiveApiKey: "",
      chatGptOAuthChecked: true,
      chatGptOAuthConnected: true,
    })).toBeNull();
  });
});

function renderConnectionPanel({
  apiKey,
  model,
}: {
  apiKey: string;
  model: string;
}) {
  return renderToStaticMarkup(
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
          apiKey,
          model,
        },
      },
      modelOptions: {},
      modelLoadState: {},
      oauthAccount: null,
      oauthChecked: true,
      oauthStatus: null,
      saveStatus: "브라우저에 자동 저장됨",
      onChange: () => undefined,
      onLoadModels: () => undefined,
      onTestConnection: () => undefined,
      onOpenChatGptLogin: () => undefined,
      onCheckChatGptAccount: () => undefined,
      onSave: () => undefined,
    }),
  );
}
