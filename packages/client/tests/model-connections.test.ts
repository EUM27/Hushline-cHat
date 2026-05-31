import { describe, expect, test } from "bun:test";
import { canUseOpenAiOAuthRedirectInCurrentBrowser } from "../src/hooks/useModelConnections";

describe("canUseOpenAiOAuthRedirectInCurrentBrowser", () => {
  const authorizeUrl =
    "https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback";

  test("blocks loopback OAuth redirects from a remote browser hostname", () => {
    expect(canUseOpenAiOAuthRedirectInCurrentBrowser(authorizeUrl, "100.122.163.109")).toBe(false);
  });

  test("allows loopback OAuth redirects from a local browser hostname", () => {
    expect(canUseOpenAiOAuthRedirectInCurrentBrowser(authorizeUrl, "localhost")).toBe(true);
  });
});
