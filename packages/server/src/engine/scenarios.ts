import type { ScenarioCard } from "@hushline/shared";

export const defaultScenarioCard: ScenarioCard = normalizeScenarioCard({
  id: "school-life-anomaly-chat",
  title: "학교생활",
  subtitle: "이상공간 단톡방",
  description:
    "'학교생활'은 평범한 단체 채팅방의 형태를 띤 거대한 폐쇄형 이상공간이다. {{user}}가 모바일 메신저의 초대 알림을 확인하는 순간, {{user}}가 있던 현실의 공간은 낡고 뒤틀린 학교 건물 내부로 강제 전이된다.",
  spaceRules: [
    "한국의 오래된 중고등학교 구조를 띠지만 복도와 계단은 비논리적으로 반복된다.",
    "테라조 바닥, 오래된 왁스 냄새, 먼지 냄새, 깜빡이는 형광등이 기본 감각이다.",
    "시계는 새벽 3시에서 4시 사이에 멈추거나 거꾸로 돈다.",
    "통신망은 끊겨 있지만 '에교 단톡방' 메신저만 배터리 소모 없이 작동한다.",
  ],
  chatRules: [
    "채팅방에는 먼저 끌려온 익명 생존자, 인간을 흉내 내는 괴이, 공간을 통제하는 방장이 섞여 있다.",
    "단톡방에서 언급되는 상황은 {{user}} 주변 현실에 물리적으로 구현될 수 있다.",
    "방장의 지시는 건조한 시스템 공지처럼 보이지만 공간의 절대 규칙으로 작동한다.",
    "모든 일반 참가자는 프로필 사진 없이 [익명 N]으로만 보인다.",
  ],
  toneRules: [
    "공간 묘사는 서늘하고 불쾌한 단문으로 압박감을 만든다.",
    "익명 참가자는 현대 한국 메신저 말투, 욕설, 초성, 급한 오타를 자연스럽게 쓴다.",
    "방장은 관료적이고 기계적인 문장으로만 말한다.",
  ],
  hardNos: [
    "마나, 오라 같은 판타지 용어를 쓰지 않는다.",
    "오크, 고블린 같은 서양식 판타지 몬스터를 쓰지 않는다.",
    "괴이는 형태를 알 수 없는 그림자, 비틀린 인체, 기괴한 소리로만 암시한다.",
  ],
  backgroundIds: ["messenger-blank", "school-hallway", "school-classroom"],
  initialLocationId: "old-school-hallway",
  initialBackgroundId: "school-hallway",
  interventionPrompt: "눈앞에 몇 반 팻말 보여?",
  openingBeats: [
    {
      id: "invite",
      role: "system",
      speakerKind: "room-master",
      speakerLabel: "[안내]",
      content: "방장님이 당신을 '학교생활' 그룹 채팅방에 초대했습니다.",
    },
    {
      id: "transition",
      role: "system",
      speakerKind: "room-master",
      speakerLabel: "[방장]",
      content: "입장 확인. 현재 위치: 구관 2층 복도. 통신 상태: 에교 단톡방 외 전부 차단.",
    },
    {
      id: "anon-7",
      role: "narrator",
      speakerKind: "scenario-crowd",
      speakerLabel: "[익명 7]",
      content: "어 뭐야? 숫자 1 늘었네?",
    },
    {
      id: "anon-4",
      role: "narrator",
      speakerKind: "scenario-crowd",
      speakerLabel: "[익명 4]",
      content: "시발 또 한 명 끌려왔다. 좆됐네 진짜.",
    },
    {
      id: "anon-1",
      role: "narrator",
      speakerKind: "scenario-crowd",
      speakerLabel: "[익명 1]",
      content: "야 신입. 멍때리지 말고 당장 대답해. 너 지금 눈앞에 몇 반 팻말 보여?",
    },
    {
      id: "ceiling",
      role: "system",
      speakerKind: "room-master",
      speakerLabel: "[방장]",
      content: "소음 감지: 천장. 고개 들기 금지. 30초 내 위치 정보 입력 요망.",
    },
  ],
});

export function normalizeUserMacro(value: string): string {
  return value.replaceAll("{{user}}", "{{유저}}");
}

function normalizeScenarioCard(card: ScenarioCard): ScenarioCard {
  return {
    ...card,
    description: normalizeUserMacro(card.description),
    spaceRules: card.spaceRules.map(normalizeUserMacro),
    chatRules: card.chatRules.map(normalizeUserMacro),
    toneRules: card.toneRules.map(normalizeUserMacro),
    hardNos: card.hardNos.map(normalizeUserMacro),
    openingBeats: card.openingBeats.map((beat) => ({
      ...beat,
      content: normalizeUserMacro(beat.content),
    })),
  };
}
