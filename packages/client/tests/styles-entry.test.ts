import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("styles entrypoint", () => {
  test("loads surface styles in the documented order", () => {
    const css = readFileSync(join(import.meta.dir, "../src/styles.css"), "utf8").trim();
    expect(css).toBe([
      '@import "./styles/base.css";',
      '@import "./styles/app-shell.css";',
      '@import "./styles/chat.css";',
      '@import "./styles/connections.css";',
      '@import "./styles/setup.css";',
      '@import "./styles/invitation.css";',
      '@import "./styles/dev-panel.css";',
      '@import "./styles/case-board.css";',
      '@import "./styles/visual-novel.css";',
      '@import "./styles/responsive.css";',
    ].join("\n"));
  });
});
