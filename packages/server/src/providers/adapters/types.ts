import type {
  ChatMessage,
  ModelConnection,
  ModelOption,
  ModelProviderId,
  ProviderProfile,
} from "@hushline/shared";

export interface AdapterRequest {
  connection: ModelConnection;
  systemPrompt: string;
  messages: ChatMessage[];
}

export interface ConnectionAdapter {
  profile: ProviderProfile;
  complete(request: AdapterRequest): Promise<string>;
  listModels(apiKey?: string): Promise<ModelOption[]>;
}

export type ConnectionAdapterId = ModelProviderId;
