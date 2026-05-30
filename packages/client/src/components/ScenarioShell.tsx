import type { ReactNode } from "react";
import type { VisualThemePreset } from "../types/ui";
import { createVisualThemeStyle } from "../utils/ui-helpers";

export function ScenarioShell({ children, theme }: { children: ReactNode; theme: VisualThemePreset }) {
  return (
    <section
      className="scenario-shell vn-split-skin text-blue-100 font-sans select-none transition-colors duration-500"
      style={createVisualThemeStyle(theme)}
      aria-label="시나리오 화면"
    >
      {children}
    </section>
  );
}
