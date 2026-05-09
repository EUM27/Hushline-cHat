import type { ConnectionAdapter } from "./types";
import { completeOpenAiCompatible, listOpenAiCompatibleModels } from "./openai-compatible";

export const nanogptAdapter: ConnectionAdapter = {
  profile: {
    id: "nanogpt",
    label: "NanoGPT",
    baseUrl: "https://nano-gpt.com/api/v1",
    endpointPath: "/chat/completions",
    docsUrl: "https://docs.nano-gpt.com/api-reference/endpoint/chat-completion",
  },
  complete(request) {
    return completeOpenAiCompatible(request, this.profile.baseUrl);
  },
  listModels(apiKey) {
    return listOpenAiCompatibleModels(this.profile.baseUrl, apiKey);
  },
};
