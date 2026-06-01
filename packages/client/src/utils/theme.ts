import type { ThemeStyle, VisualThemePreset } from "../types/ui";

export function createVisualThemeStyle(theme: VisualThemePreset): ThemeStyle {
  return {
    "--theme-canvas-wash": theme.colors.canvas,
    "--vn-accent": theme.colors.accent,
    "--vn-accent-soft": theme.colors.accentSoft,
    "--vn-stage-bg": theme.colors.stagePanel,
    "--vn-stage-panel": theme.colors.stagePanel,
    "--vn-stage-border": theme.colors.stageBorder,
    "--vn-stage-text": theme.colors.stageText,
    "--vn-stage-muted": theme.colors.stageMuted,
    "--vn-phone-bg": theme.colors.phoneBg,
    "--vn-phone-surface": theme.colors.phoneSurface,
    "--vn-phone-header": theme.colors.phoneHeader,
    "--vn-phone-text": theme.colors.phoneText,
    "--vn-phone-muted": theme.colors.phoneMuted,
    "--vn-phone-border": theme.colors.phoneBorder,
    "--vn-phone-my-bubble": theme.colors.myBubble,
    "--vn-phone-other-bubble": theme.colors.otherBubble,
    "--vn-input-bg": theme.colors.inputBg,
    "--vn-character-highlight": theme.colors.characterHighlight,
    "--vn-character-eye": theme.colors.characterEye,
  } as ThemeStyle;
}
