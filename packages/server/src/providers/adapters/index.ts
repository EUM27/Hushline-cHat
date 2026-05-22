import type { ModelProviderId, ProviderProfile } from "@hushline/shared";
import { chatGptAdapter } from "./chatgpt";
import { nanogptAdapter } from "./nanogpt";
import { openrouterAdapter } from "./openrouter";
import type { AdapterRequest, ConnectionAdapter } from "./types";

export const connectionAdapters: Record<ModelProviderId, ConnectionAdapter> = {
  nanogpt: nanogptAdapter,
  openrouter: openrouterAdapter,
  chatgpt: chatGptAdapter,
};

export const providerProfiles: ProviderProfile[] = Object.values(connectionAdapters).map(
  (adapter) => adapter.profile,
);

export async function completeWithConnection(request: AdapterRequest): Promise<string> {
  const adapter = connectionAdapters[request.connection.providerId];
  if (!adapter) {
    throw new Error(`Unsupported provider: ${request.connection.providerId}`);
  }
  return adapter.complete(request);
}

export async function listModelsForProvider(
  providerId: ModelProviderId,
  apiKey?: string,
): Promise<import("@hushline/shared").ModelOption[]> {
  const adapter = connectionAdapters[providerId];
  if (!adapter) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }
  return adapter.listModels(apiKey);
}

export function isConnectionReady(
  connection?: import("@hushline/shared").ModelConnection,
): connection is import("@hushline/shared").ModelConnection {
  if (!connection?.model) {
    return false;
  }
  if (connection.providerId === "chatgpt") {
    return true;
  }
  return Boolean(connection.apiKey);
}
