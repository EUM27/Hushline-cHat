import { describe, expect, test } from "bun:test";
import { AppToolStrip } from "../src/components/AppToolStrip";
import { ScenarioShell } from "../src/components/ScenarioShell";
import { AdvisorSetupPanel } from "../src/components/setup/AdvisorSetupPanel";
import { PersonaSetupPanel } from "../src/components/setup/PersonaSetupPanel";
import { ScenarioSetupPanel } from "../src/components/setup/ScenarioSetupPanel";

describe("app shell component modules", () => {
  test("exports the extracted app shell components", () => {
    expect(typeof AppToolStrip).toBe("function");
    expect(typeof ScenarioShell).toBe("function");
    expect(typeof ScenarioSetupPanel).toBe("function");
    expect(typeof PersonaSetupPanel).toBe("function");
    expect(typeof AdvisorSetupPanel).toBe("function");
  });
});
