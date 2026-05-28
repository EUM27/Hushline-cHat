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
    {
      id: "lodge-maintenance-room",
      name: "산장 설비실",
      url: "/assets/backgrounds/lodge-maintenance-room.png",
      kind: "interior",
      tags: ["lodge", "maintenance", "generator", "boiler", "keys", "snow-window"],
    },
    {
      id: "lodge-study-door",
      name: "2층 서재 문 앞",
      url: "/assets/backgrounds/lodge-study-door.png",
      kind: "interior",
      tags: ["lodge", "study-door", "locked-door", "hallway", "book"],
    },
    {
      id: "lodge-upstairs-hallway",
      name: "2층 복도",
      url: "/assets/backgrounds/lodge-upstairs-hallway.png",
      kind: "interior",
      tags: ["lodge", "hallway", "second-floor", "snow-window", "night"],
    },
    {
      id: "lodge-dining-room",
      name: "산장 식당",
      url: "/assets/backgrounds/lodge-dining-room.png",
      kind: "interior",
      tags: ["lodge", "dining-room", "fireplace", "table", "night"],
    },
    {
      id: "lodge-exterior-storm",
      name: "폭설 속 산장 외부",
      url: "/assets/backgrounds/lodge-exterior-storm.png",
      kind: "exterior",
      tags: ["lodge", "exterior", "snowstorm", "night", "isolated"],
    },
    {
      id: "lodge-foyer",
      name: "산장 현관홀",
      url: "/assets/backgrounds/lodge-foyer.png",
      kind: "interior",
      tags: ["lodge", "foyer", "entrance", "staircase", "snow"],
    },
    {
      id: "lodge-exterior-drive",
      name: "눈 쌓인 진입로",
      url: "/assets/backgrounds/lodge-exterior-drive.png",
      kind: "exterior",
      tags: ["lodge", "exterior", "driveway", "snow-tracks", "night"],
    },
    {
      id: "lodge-study-crime-scene",
      name: "서재 사건 현장",
      url: "/assets/backgrounds/lodge-study-crime-scene.png",
      kind: "interior",
      tags: ["lodge", "study", "crime-scene", "body", "blood", "locked-room"],
    },
  ],
  sprites: [
    {
      id: "kang-mujin-neutral",
      characterId: "kang-mujin",
      expression: "neutral",
      url: "/assets/sprites/kang-mujin/full_neutral.png?v=transparent-20260528",
      fullBody: true,
    },
    {
      id: "yoon-haeon-neutral",
      characterId: "yoon-haeon",
      expression: "neutral",
      url: "/assets/sprites/yoon-haeon/full_neutral.png?v=transparent-20260528",
      fullBody: true,
    },
    {
      id: "yoon-seha-neutral",
      characterId: "yoon-seha",
      expression: "neutral",
      url: "/assets/sprites/yoon-seha/full_neutral.png?v=transparent-20260528",
      fullBody: true,
    },
  ],
};
