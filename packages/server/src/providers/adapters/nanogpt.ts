import type { ConnectionAdapter } from "./types";
import type { ModelOption } from "@hushline/shared";
import { completeOpenAiCompatible } from "./openai-compatible";

type NanoGptBillingTier = "subscription" | "paid";

const nanoGptModelCatalogs: Array<{ tier: NanoGptBillingTier; url: string }> = [
  { tier: "subscription", url: "https://nano-gpt.com/api/subscription/v1/models?detailed=true" },
  { tier: "paid", url: "https://nano-gpt.com/api/paid/v1/models?detailed=true" },
];

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
    return listNanoGptModels(apiKey);
  },
};

async function listNanoGptModels(apiKey?: string): Promise<ModelOption[]> {
  const catalogs = await Promise.all(nanoGptModelCatalogs.map(async (catalog) => ({
    tier: catalog.tier,
    models: await fetchNanoGptModelCatalog(catalog.url, catalog.tier, apiKey),
  })));

  const byId = new Map<string, ModelOption>();
  for (const catalog of catalogs) {
    for (const model of catalog.models) {
      if (!byId.has(model.id)) {
        byId.set(model.id, model);
      }
    }
  }

  return [...byId.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "en", { sensitivity: "base" }),
  );
}

async function fetchNanoGptModelCatalog(
  url: string,
  tier: NanoGptBillingTier,
  apiKey?: string,
): Promise<ModelOption[]> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`NanoGPT ${tier} model list request failed: ${response.status} ${detail}`.trim());
  }

  const payload = await response.json();
  const rawModels: unknown[] = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : [];

  return rawModels
    .map((model: unknown) => normalizeNanoGptModelOption(model, tier))
    .filter((model): model is ModelOption => Boolean(model));
}

function normalizeNanoGptModelOption(model: unknown, tier: NanoGptBillingTier): ModelOption | null {
  if (!model || typeof model !== "object") {
    return null;
  }
  const record = model as Record<string, unknown>;
  const id = typeof record.id === "string"
    ? record.id
    : typeof record.model === "string"
      ? record.model
      : typeof record.slug === "string"
        ? record.slug
        : "";
  if (!id.trim()) {
    return null;
  }
  const label = typeof record.name === "string" && record.name.trim()
    ? record.name
    : typeof record.label === "string" && record.label.trim()
      ? record.label
      : id;
  return {
    id,
    label,
    billingTier: tier,
  };
}
