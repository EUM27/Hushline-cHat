import type { CSSProperties } from "react";
import type { ModelOption } from "@hushline/shared";

export interface ModelsResponse {
  models: ModelOption[];
}

export interface OpenAiOAuthAccount {
  connected?: boolean;
  email?: string;
  planType?: string;
}

export interface OpenAiOAuthLoginResult {
  ok: boolean;
  authorizeUrl?: string;
  account?: OpenAiOAuthAccount | null;
  error?: string;
}

export interface ConnectionStatus {
  tone: "ready" | "warning" | "idle";
  label: string;
  detail: string;
}

export interface ConnectionSlot {
  key: string;
  title: string;
  subtitle: string;
}

export interface PersonaDraft {
  name: string;
  shortName: string;
  role: string;
  description: string;
  appearance: string;
  portraitUrl?: string;
  relationshipTags: string[];
}

export type SetupStep = "scenario" | "persona";
export type VisualThemeId = "moonlight" | "dunkshoot" | "cherryNight";

export interface VisualThemePreset {
  id: VisualThemeId;
  name: string;
  shortName: string;
  desc: string;
  systemTag: string;
  isDark: boolean;
  tw: {
    headerBg: string;
    chatAreaBg: string;
    myBubble: string;
    otherBubble: string;
    myTime: string;
    otherTime: string;
    otherName: string;
    dateLabel: string;
    inputAreaBg: string;
    inputBox: string;
    sendBtnActive: string;
    plusBtn: string;
    badgeColor: string;
    rightHeaderTextColor: string;
    rightHeaderDotGlow: string;
    rightPanelBg: string;
    rightPanelGlow: string;
    rightTextClass: string;
    rightNameTag: string;
    rightInputBg: string;
    rightNextBtn: string;
    rightSendBtn: string;
    rightMenuBtn: string;
  };
  colors: {
    canvas: string;
    phoneBg: string;
    phoneSurface: string;
    phoneHeader: string;
    phoneText: string;
    phoneMuted: string;
    phoneBorder: string;
    otherBubble: string;
    myBubble: string;
    inputBg: string;
    stagePanel: string;
    stageBorder: string;
    stageText: string;
    stageMuted: string;
    accent: string;
    accentSoft: string;
    characterHighlight: string;
    characterEye: string;
  };
}

export type ThemeStyle = CSSProperties & Record<`--${string}`, string>;
