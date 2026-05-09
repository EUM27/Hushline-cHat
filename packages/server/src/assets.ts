import type { AssetManifest } from "@hushline/shared";

export const assetManifest: AssetManifest = {
  backgrounds: [
    {
      id: "messenger-blank",
      name: "메신저 화면",
      url: "/assets/backgrounds/messenger-blank.svg",
      kind: "messenger",
    },
    {
      id: "school-exterior",
      name: "벚꽃과 학교",
      url: "/assets/backgrounds/school-exterior.png",
      kind: "school",
    },
    {
      id: "school-hallway",
      name: "학교 복도",
      url: "/assets/backgrounds/school-hallway.png",
      kind: "interior",
    },
    {
      id: "school-classroom",
      name: "새 학기 교실",
      url: "/assets/backgrounds/school-classroom.png",
      kind: "interior",
    },
  ],
  sprites: [
    {
      id: "evan-neutral",
      characterId: "evan",
      expression: "neutral",
      url: "/assets/sprites/evan/full_neutral.png",
      fullBody: true,
    },
    {
      id: "evan-happy",
      characterId: "evan",
      expression: "happy",
      url: "/assets/sprites/evan/full_happy.png",
      fullBody: true,
    },
    {
      id: "evan-sad",
      characterId: "evan",
      expression: "sad",
      url: "/assets/sprites/evan/full_sad.png",
      fullBody: true,
    },
    {
      id: "evan-thinking",
      characterId: "evan",
      expression: "thinking",
      url: "/assets/sprites/evan/full_thinking.png",
      fullBody: true,
    },
    {
      id: "evan-surprised",
      characterId: "evan",
      expression: "surprised",
      url: "/assets/sprites/evan/full_surprise.png",
      fullBody: true,
    },
  ],
};
