import type { ConnectionAdapter } from "./types";
import { completeOpenAiCompatible, listOpenAiCompatibleModels } from "./openai-compatible";

export const openrouterAdapter: ConnectionAdapter = {
  profile: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    endpointPath: "/chat/completions",
    docsUrl: "https://openrouter.ai/docs/api-reference/chat-completion",
  },
  complete(request) {
    return completeOpenAiCompatible(request, this.profile.baseUrl);
  },
  listModels(apiKey) {
    return listOpenAiCompatibleModels(this.profile.baseUrl, apiKey);
  },
};
