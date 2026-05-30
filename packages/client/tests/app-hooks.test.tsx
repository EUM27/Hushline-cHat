import { describe, expect, test } from "bun:test";
import { useBootData } from "../src/hooks/useBootData";
import { useModelConnections } from "../src/hooks/useModelConnections";
import { useScenarioSelection } from "../src/hooks/useScenarioSelection";
import { useSessionActions } from "../src/hooks/useSessionActions";

describe("app state hook modules", () => {
  test("exports the extracted app state hooks", () => {
    expect(typeof useBootData).toBe("function");
    expect(typeof useScenarioSelection).toBe("function");
    expect(typeof useModelConnections).toBe("function");
    expect(typeof useSessionActions).toBe("function");
  });
});
