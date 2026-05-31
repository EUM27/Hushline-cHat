import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "@hushline/shared";
import {
  activeConnections,
  getConnectionStatus,
  getStageCharacterId,
  getStageSpeakerLabel,
  isPhoneChannelMessage,
  isStageMessage,
  parseMessageFormat,
  summarizeCaseRuntimeForDevPanel,
  summarizeStateLawForDevPanel,
} from "../src/utils/ui-helpers";

const baseMessage = {
  id: "message-1",
  sessionId: "session-1",
  createdAt: "2026-05-28T00:00:00.000Z",
} satisfies Pick<ChatMessage, "id" | "sessionId" | "createdAt">;

describe("phone/stage message routing", () => {
  test("keeps narrator scene prose on the VN screen even when it uses scenario-crowd speaker kind", () => {
    const message = {
      ...baseMessage,
      role: "narrator",
      speakerKind: "scenario-crowd",
      speakerLabel: "[나레이터]",
      content: "설산 산장의 복도에는 전기가 끊긴 뒤의 정적만 남아 있었다.",
    } satisfies ChatMessage;

    expect(isPhoneChannelMessage(message)).toBe(false);
    expect(isStageMessage(message)).toBe(true);
  });

  test("routes anonymous phone chatter to the left phone log", () => {
    const message = {
      ...baseMessage,
      role: "narrator",
      speakerKind: "scenario-crowd",
      speakerLabel: "[익명 7]",
      content: "지금 누구 문 앞에 있는 거야?",
    } satisfies ChatMessage;

    expect(isPhoneChannelMessage(message)).toBe(true);
    expect(isStageMessage(message)).toBe(false);
  });

  test("keeps stage system prompts on the VN screen", () => {
    const message = {
      ...baseMessage,
      role: "system",
      speakerKind: "room-master",
      speakerLabel: "[시스템]",
      content: "무엇을 조사하시겠습니까?",
      isOpeningBeat: true,
    } satisfies ChatMessage;

    expect(isPhoneChannelMessage(message)).toBe(false);
    expect(isStageMessage(message)).toBe(true);
  });

  test("routes room-master phone notices to the left phone log only when they are digital notices", () => {
    const message = {
      ...baseMessage,
      role: "system",
      speakerKind: "room-master",
      speakerLabel: "[방장]",
      content: "입장 확인: 전원 접속 완료.",
    } satisfies ChatMessage;

    expect(isPhoneChannelMessage(message)).toBe(true);
    expect(isStageMessage(message)).toBe(false);
  });

  test("uses explicit VN speaker labels before generic narrator or system labels", () => {
    const narrator = {
      ...baseMessage,
      role: "narrator",
      speakerKind: "named-actor",
      speakerLabel: "{{유저}}",
      content: "……정말 골치 아프네요. 전화도 안 됩니다.",
    } satisfies ChatMessage;

    const system = {
      ...baseMessage,
      id: "message-2",
      role: "system",
      speakerLabel: "[시스템]",
      content: "무엇을 조사하시겠습니까?",
    } satisfies ChatMessage;

    expect(getStageSpeakerLabel(narrator, "fallback")).toBe("{{유저}}");
    expect(getStageSpeakerLabel(system, "fallback")).toBe("[시스템]");
  });

  test("does not resolve a standee from non-character stage messages", () => {
    const narrator = {
      ...baseMessage,
      role: "narrator",
      speakerLabel: "[나레이터]",
      content: "현관의 조명이 낮게 떨렸다.",
    } satisfies ChatMessage;

    const character = {
      ...baseMessage,
      id: "message-2",
      role: "character",
      characterId: "kang-mujin",
      speakerLabel: "강무진",
      content: "경찰 올 때까지 아무도 나가지 마.",
    } satisfies ChatMessage;

    expect(getStageCharacterId(narrator)).toBeUndefined();
    expect(getStageCharacterId(character)).toBe("kang-mujin");
  });
});

describe("developer state law summary", () => {
  test("summarizeStateLawForDevPanel exposes law categories without player-facing copy", () => {
    const rows = summarizeStateLawForDevPanel({
      immutableFacts: ["시나리오: 설산 산장 살인사건"],
      slowState: [],
      scenePressure: ["긴장 6 / 위험 3"],
      outputRules: ["유저 행동/생각/감정 대리 금지"],
    });

    expect(rows).toContain("고정: 시나리오: 설산 산장 살인사건");
    expect(rows).toContain("압력: 긴장 6 / 위험 3");
    expect(rows).toContain("규칙: 유저 행동/생각/감정 대리 금지");
  });
});

describe("developer case runtime summary", () => {
  test("summarizeCaseRuntimeForDevPanel exposes inquiry scope without player-facing copy", () => {
    const rows = summarizeCaseRuntimeForDevPanel({
      inquiry: {
        isCaseInquiry: true,
        inquiryType: "witness_testimony",
        topicTags: ["table", "blackout"],
        referencedEvidenceIds: [],
        referencedClaimIds: [],
        requestedTruthLevel: "testimony",
        truthLeakRisk: 2,
      },
      answerScope: {
        inquiryFrame: {
          isCaseInquiry: true,
          inquiryType: "witness_testimony",
          topicTags: ["table", "blackout"],
          referencedEvidenceIds: [],
          referencedClaimIds: [],
          requestedTruthLevel: "testimony",
          truthLeakRisk: 2,
        },
        publicFactIds: ["pub_key_after_blackout"],
        observableFactIds: [],
        allowedWitnesses: [{
          characterId: "yoon-haeon",
          testimonySeedIds: ["testimony_haeon_lounge_shadow"],
          factIds: ["fact_lounge_shadow_before_blackout"],
          canSay: [],
          mustNotSay: [],
          certainty: "uncertain",
          maxRevealLevel: "partial",
        }],
        blockedFactIds: [],
        blockedTruthIds: ["truth_killer_identity"],
        recommendedSpeakerIds: ["yoon-haeon"],
        answerability: "partial",
      },
      boundarySummary: ["character: pass"],
    });

    expect(rows).toContain("질문: witness_testimony · 위험 2");
    expect(rows).toContain("주제: table, blackout");
    expect(rows).toContain("답변성: partial");
    expect(rows).toContain("추천 화자: yoon-haeon");
    expect(rows).toContain("차단 진상: truth_killer_identity");
  });
});

describe("message markdown formatting", () => {
  test("maps quoted character dialogue and thought into semantic formatting tokens", () => {
    expect(parseMessageFormat("\"밖은 위험해요.\"\n'그래도 확인해야 해.'")).toEqual([
      { kind: "dialogue", text: "밖은 위험해요." },
      { kind: "lineBreak" },
      { kind: "thought", text: "그래도 확인해야 해." },
    ]);
  });

  test("maps narrator markdown into bold and italic tokens without using raw HTML", () => {
    expect(parseMessageFormat("복도에는 **정적**이 *낮게* 깔렸다.")).toEqual([
      { kind: "text", text: "복도에는 " },
      { kind: "bold", text: "정적" },
      { kind: "text", text: "이 " },
      { kind: "italic", text: "낮게" },
      { kind: "text", text: " 깔렸다." },
    ]);
  });
});

describe("model connection readiness", () => {
  const profiles = [
    {
      id: "chatgpt" as const,
      label: "ChatGPT",
      baseUrl: "https://chatgpt.com/backend-api/codex",
      endpointPath: "/chat/completions",
      docsUrl: "https://help.openai.com/",
    },
  ];

  test("does not mark ChatGPT as API-ready before OAuth is confirmed", () => {
    const status = getConnectionStatus(
      { providerId: "chatgpt", apiKey: "", model: "gpt-5.4" },
      profiles,
      "",
      { chatGptOAuthChecked: true, chatGptOAuthConnected: false },
    );

    expect(status.label).toBe("로그인 필요");
  });

  test("does not send ChatGPT connections to the engine before OAuth is confirmed", () => {
    expect(activeConnections({
      default: { providerId: "chatgpt", apiKey: "", model: "gpt-5.4" },
    }, { chatGptOAuthConnected: false })).toEqual({});
  });

  test("allows ChatGPT connections after OAuth is confirmed", () => {
    expect(activeConnections({
      default: { providerId: "chatgpt", apiKey: "", model: "gpt-5.4" },
    }, { chatGptOAuthConnected: true })).toEqual({
      default: { providerId: "chatgpt", apiKey: "", model: "gpt-5.4" },
    });
  });
});
