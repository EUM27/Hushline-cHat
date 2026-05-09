import type { AdapterRequest } from "./types";
import type { ModelOption } from "@hushline/shared";

export async function completeOpenAiCompatible(
  request: AdapterRequest,
  defaultBaseUrl: string,
): Promise<string> {
  const baseUrl = (request.connection.baseUrl || defaultBaseUrl).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${request.connection.apiKey}`,
    },
    body: JSON.stringify({
      model: request.connection.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        ...request.messages.map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          content: message.content,
        })),
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Provider request failed: ${response.status} ${detail}`.trim());
  }

  const payload = await response.json();
  return payload.choices?.[0]?.message?.content ?? "";
}

export async function listOpenAiCompatibleModels(
  defaultBaseUrl: string,
  apiKey?: string,
): Promise<ModelOption[]> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${defaultBaseUrl.replace(/\/$/, "")}/models`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Model list request failed: ${response.status} ${detail}`.trim());
  }

  const payload = await response.json();
  const rawModels = Array.isArray(payload.data) ? payload.data : [];

  return rawModels
    .map((model: { id?: string; name?: string }) => {
      if (!model.id) {
        return null;
      }
      return {
        id: model.id,
        label: model.name || model.id,
      };
    })
    .filter((model: ModelOption | null): model is ModelOption => Boolean(model))
    .sort((left: ModelOption, right: ModelOption) => left.label.localeCompare(right.label));
}
