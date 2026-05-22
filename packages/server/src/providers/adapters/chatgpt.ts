import type { ConnectionAdapter } from "./types";
import { completeOpenAiOAuth, listOpenAiOAuthModels } from "../openai-oauth";

export const chatGptAdapter: ConnectionAdapter = {
  profile: {
    id: "chatgpt",
    label: "ChatGPT",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    endpointPath: "/responses",
    docsUrl: "https://auth.openai.com",
  },
  complete(request) {
    return completeOpenAiOAuth(request);
  },
  listModels() {
    return listOpenAiOAuthModels();
  },
};
