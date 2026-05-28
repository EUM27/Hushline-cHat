import { describe, expect, test } from "bun:test";
import type { ModelOption } from "@hushline/shared";
import { getVisibleModelOptions } from "../src/components/ModelSearchPicker";

describe("getVisibleModelOptions", () => {
  test("keeps every loaded provider model visible instead of truncating broad catalogs", () => {
    const models = Array.from({ length: 200 }, (_, index): ModelOption => ({
      id: `provider/model-${index.toString().padStart(3, "0")}`,
      label: `Provider Model ${index.toString().padStart(3, "0")}`,
    }));

    const visible = getVisibleModelOptions(models, "provider");

    expect(visible).toHaveLength(200);
    expect(visible.at(0)?.id).toBe("provider/model-000");
    expect(visible.at(-1)?.id).toBe("provider/model-199");
  });

  test("keeps selected custom model visible even when it is not in the loaded provider list", () => {
    const models = Array.from({ length: 80 }, (_, index): ModelOption => ({
      id: `provider/model-${index}`,
      label: `Provider Model ${index}`,
    }));

    const visible = getVisibleModelOptions(models, "provider", "custom/manual-model");

    expect(visible).toHaveLength(81);
    expect(visible[0]).toEqual({ id: "custom/manual-model", label: "custom/manual-model" });
  });
});
