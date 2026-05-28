# Director Law State Owner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hushline v2 behave like a state-based roleplay engine where the world remembers what is true, each layer has clear authority, and model/API slots are secondary to scene law.

**Architecture:** Keep the existing `DirectorOutput`, `WorldState`, `BoundaryReport`, and `Director -> Narrator -> Character` pipeline. Add a small Director Law layer on top of existing state and boundary modules, then expose the law/state evidence in developer UI before building a full editor page.

**Tech Stack:** TypeScript, Bun tests, Vite client, existing `@hushline/shared` engine-v2 types, server v2 turn pipeline, React client DevPanel.

---

## Current Source Of Truth

- `packages/shared/src/engine-v2.ts`
  - Owns `WorldState`, `DirectorOutput`, `BoundaryReport`, and turn result types.
- `packages/server/src/engine-v2/pipeline.ts`
  - Current orchestration path: input classification, context build, Director, Narrator, Character, state update, message assembly.
- `packages/server/src/engine-v2/boundary.ts`
  - Current role authority guard for Director, Narrator, and Character outputs.
- `packages/server/src/engine-v2/state-manager.ts`
  - Current state mutation path after Director output is accepted.
- `packages/client/src/components/DevPanel.tsx`
  - Current developer-only inspection surface.
- `packages/client/src/components/ConnectionPanel.tsx`
  - Current model-slot-heavy surface; do not expand this before state/law visibility exists.

## Product Contract

- `WorldState` is the truth owner. Character sheets, chat history, and model output are inputs, not truth.
- Director may propose pressure and state changes, but Director Law decides what is allowed.
- Narrator describes public space, sensory effects, and observable consequences only.
- Character agents speak or briefly gesture as themselves only.
- User actions, thoughts, feelings, and decisions are never authored by narrator or characters.
- API/model separation stays available, but it is not the primary architecture path.
- Boundary reports remain developer-only.

---

### Task 1: Add State Law Snapshot

**Files:**
- Modify: `packages/shared/src/engine-v2.ts`
- Create: `packages/server/src/engine-v2/state-law.ts`
- Test: `packages/server/src/engine-v2/__tests__/state-law.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/engine-v2/__tests__/state-law.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { ScenarioPack, WorldState } from "@hushline/shared";
import { buildStateLawSnapshot } from "../state-law";

describe("state law snapshot", () => {
  test("separates immutable facts, slow state, scene pressure, and output rules", () => {
    const snapshot = buildStateLawSnapshot(makeWorldState(), makePack());

    expect(snapshot.immutableFacts).toContain("시나리오: 설산 산장 살인사건");
    expect(snapshot.immutableFacts).toContain("현재 허용 장소: lodge-foyer");
    expect(snapshot.slowState).toContain("강무진: 신뢰도 0");
    expect(snapshot.scenePressure).toContain("긴장 6 / 위험 3");
    expect(snapshot.outputRules).toContain("유저 행동/생각/감정 대리 금지");
    expect(snapshot.outputRules).toContain("허용되지 않은 장소 이동 금지");
  });
});

function makeWorldState(): WorldState {
  return {
    sessionId: "s1",
    scenarioId: "locked-room-mystery",
    sceneMode: "dialogue",
    locationId: "lodge-foyer",
    backgroundId: "lodge-foyer",
    tension: 6,
    danger: 3,
    turnNumber: 4,
    hasEnteredScene: true,
    mainObjective: { id: "solve", description: "범인을 찾는다.", status: "active" },
    subObjectives: [],
    characterStates: {
      "kang-mujin": {
        id: "kang-mujin",
        currentObjective: "현장을 통제한다.",
        knownFacts: ["피해자가 서재에서 발견됐다."],
        relationshipToUser: 0,
        lastSpokeTurn: 3,
        isRevealed: true,
        autonomy: 0.8,
      },
    },
    relationshipGraph: [],
    recentEvents: [],
    recentSpeakerIds: ["kang-mujin"],
  };
}

function makePack(): ScenarioPack {
  return {
    manifest: {
      id: "locked-room-mystery",
      title: "설산 산장 살인사건",
      subtitle: "폭설 속 산장",
      genre: "mystery",
      version: "1.0.0",
      engineVersion: ">=2.0.0",
      uiMode: "scene-first",
    },
    scenarioCard: {
      id: "locked-room-mystery-card",
      title: "설산 산장 살인사건",
      subtitle: "폭설 속 산장",
      description: "",
      spaceRules: ["서재는 조사 전까지 직접 진입할 수 없다."],
      chatRules: [],
      toneRules: [],
      hardNos: [],
      backgroundIds: ["lodge-foyer", "lodge-study"],
      initialLocationId: "lodge-foyer",
      initialBackgroundId: "lodge-foyer",
      initialSceneMode: "dialogue",
      interventionPrompt: "",
      openingBeats: [],
    },
    characters: [
      {
        id: "kang-mujin",
        name: "강무진",
        shortName: "무진",
        role: "형사",
        profileKind: "named-actor",
        anonymousLabel: "강무진",
        mbti: "ISTJ",
        ocean: { openness: 4, conscientiousness: 8, extraversion: 3, agreeableness: 3, neuroticism: 4 },
        autonomy: 0.8,
        systemPrompt: "",
        handout: {
          secret: "피해자와 과거 악연이 있다.",
          desire: "현장을 통제한다.",
          objective: "범인을 찾는다.",
          initialRelationshipToUser: 0,
        },
        relationships: [],
      },
    ],
    directorPrompt: "",
    narratorPrompt: "",
    mainObjective: { id: "solve", description: "범인을 찾는다." },
    eventTriggers: [],
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/engine-v2/__tests__/state-law.test.ts
```

Expected: FAIL because `../state-law` does not exist.

- [ ] **Step 3: Add shared type**

Modify `packages/shared/src/engine-v2.ts` near the Boundary Report section:

```ts
export interface StateLawSnapshot {
  immutableFacts: string[];
  slowState: string[];
  scenePressure: string[];
  outputRules: string[];
}
```

- [ ] **Step 4: Implement snapshot builder**

Create `packages/server/src/engine-v2/state-law.ts`:

```ts
import type { CharacterDefinition, ScenarioPack, StateLawSnapshot, WorldState } from "@hushline/shared";

export function buildStateLawSnapshot(worldState: WorldState, pack: ScenarioPack): StateLawSnapshot {
  const allowedLocations = [
    worldState.locationId,
    pack.scenarioCard.initialLocationId,
    ...pack.scenarioCard.backgroundIds,
  ].filter(Boolean);

  return {
    immutableFacts: [
      `시나리오: ${pack.manifest.title}`,
      `현재 허용 장소: ${[...new Set(allowedLocations)].join(", ")}`,
      `주 목표: ${worldState.mainObjective.description}`,
    ],
    slowState: Object.values(worldState.characterStates).map((state) => {
      const character = pack.characters.find((candidate) => candidate.id === state.id);
      return `${getCharacterLabel(character, state.id)}: 신뢰도 ${state.relationshipToUser}`;
    }),
    scenePressure: [
      `긴장 ${worldState.tension} / 위험 ${worldState.danger}`,
      `장면 모드: ${worldState.sceneMode}`,
      `현재 위치: ${worldState.locationId}`,
    ],
    outputRules: [
      "유저 행동/생각/감정 대리 금지",
      "허용되지 않은 장소 이동 금지",
      "조사 전 진상/범인/트릭 확정 금지",
      "나레이터의 캐릭터 대사 작성 금지",
      "캐릭터의 타인 대사/행동 작성 금지",
    ],
  };
}

function getCharacterLabel(character: CharacterDefinition | undefined, fallbackId: string): string {
  return character?.anonymousLabel ?? character?.name ?? fallbackId;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/engine-v2/__tests__/state-law.test.ts
corepack pnpm --filter @hushline/server check
```

Expected: PASS and typecheck clean.

---

### Task 2: Promote Director Boundary Into Director Law

**Files:**
- Modify: `packages/server/src/engine-v2/boundary.ts`
- Create: `packages/server/src/engine-v2/director-law.ts`
- Modify: `packages/server/src/engine-v2/pipeline.ts`
- Test: `packages/server/src/engine-v2/__tests__/director-law.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/engine-v2/__tests__/director-law.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { DirectorOutput, ScenarioPack, WorldState } from "@hushline/shared";
import { enforceDirectorLaw } from "../director-law";

describe("director law", () => {
  test("removes unauthorized scene changes and unsafe narrator/character authority", () => {
    const { output, report } = enforceDirectorLaw(makeDirectorOutput(), makeWorldState(), makePack());

    expect(output.stateDelta.locationId).toBeUndefined();
    expect(output.event).toBeNull();
    expect(output.narratorInstruction).toContain("공개적으로 관찰 가능한");
    expect(output.characterIntents["kang-mujin"]).toContain("공개된 정보");
    expect(report.violations.map((violation) => violation.code)).toContain("invalid-location");
    expect(report.violations.map((violation) => violation.code)).toContain("premature-event-reveal");
    expect(report.violations.map((violation) => violation.code)).toContain("premature-narrator-reveal");
    expect(report.violations.map((violation) => violation.code)).toContain("foreign-hidden-intent");
  });
});

function makeDirectorOutput(): DirectorOutput {
  return {
    speakers: ["kang-mujin"],
    silence: false,
    event: "범인은 윤서하라는 진상이 드러난다.",
    narratorInstruction: "밀실 트릭의 정답을 설명한다.",
    characterIntents: {
      "kang-mujin": "윤서하가 숨긴 예비 열쇠를 알고 추궁한다.",
    },
    messagePlan: [{ kind: "character", speakerId: "kang-mujin" }],
    stateDelta: { locationId: "secret-basement" },
    subObjectiveUpdate: null,
    relationshipUpdate: null,
    directives: [],
    delay: null,
  };
}
```

Add these helpers below `makeDirectorOutput()` in the same test file:

```ts
function makeWorldState(): WorldState {
  return {
    sessionId: "session-1",
    scenarioId: "locked-room-mystery",
    sceneMode: "dialogue",
    locationId: "lodge-foyer",
    backgroundId: "lodge-foyer",
    tension: 3,
    danger: 2,
    turnNumber: 1,
    hasEnteredScene: true,
    mainObjective: { id: "solve", description: "진상을 밝힌다.", status: "active" },
    subObjectives: [],
    characterStates: {},
    relationshipGraph: [],
    recentEvents: [],
    recentSpeakerIds: [],
  };
}

function makePack(): ScenarioPack {
  return {
    manifest: {
      id: "locked-room-mystery",
      title: "설산 산장 살인사건",
      subtitle: "",
      genre: "mystery",
      version: "1.0.0",
      engineVersion: ">=2.0.0",
      uiMode: "scene-first",
    },
    scenarioCard: {
      id: "locked-room-mystery",
      title: "설산 산장 살인사건",
      subtitle: "",
      description: "",
      spaceRules: [],
      chatRules: [],
      toneRules: [],
      hardNos: [],
      backgroundIds: ["lodge-foyer", "lodge-study"],
      initialLocationId: "lodge-foyer",
      initialBackgroundId: "lodge-foyer",
      initialSceneMode: "dialogue",
      interventionPrompt: "",
      openingBeats: [],
    },
    characters: [
      makeCharacter("kang-mujin", "강무진", "피해자와 과거 악연이 있다."),
      makeCharacter("yoon-seha", "윤서하", "숨긴 예비 열쇠를 갖고 있다."),
    ],
    directorPrompt: "",
    narratorPrompt: "",
    mainObjective: { id: "solve", description: "진상을 밝힌다." },
    eventTriggers: [],
  };
}

function makeCharacter(id: string, name: string, secret: string) {
  return {
    id,
    name,
    shortName: name.slice(1),
    role: "용의자",
    profileKind: "named-actor" as const,
    anonymousLabel: name,
    mbti: "ISTJ",
    ocean: { openness: 4, conscientiousness: 6, extraversion: 3, agreeableness: 4, neuroticism: 5 },
    autonomy: 0.7,
    systemPrompt: "",
    handout: {
      secret,
      desire: "의심을 피한다.",
      objective: "자기 입장을 지킨다.",
      initialRelationshipToUser: 0,
    },
    relationships: [],
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/engine-v2/__tests__/director-law.test.ts
```

Expected: FAIL because `../director-law` does not exist.

- [ ] **Step 3: Implement wrapper module**

Create `packages/server/src/engine-v2/director-law.ts`:

```ts
import type { BoundaryReport, DirectorOutput, ScenarioPack, WorldState } from "@hushline/shared";
import { enforceDirectorBoundary } from "./boundary.js";

export function enforceDirectorLaw(
  directorOutput: DirectorOutput,
  worldState: WorldState,
  pack: ScenarioPack,
): { output: DirectorOutput; report: BoundaryReport } {
  return enforceDirectorBoundary(directorOutput, worldState, pack);
}
```

This first module is intentionally thin. It creates the correct ownership point without breaking the existing pipeline.

- [ ] **Step 4: Route pipeline through Director Law**

Modify `packages/server/src/engine-v2/pipeline.ts`:

```ts
import { enforceDirectorLaw } from "./director-law.js";
```

Replace:

```ts
const directorBoundary = enforceDirectorBoundary(directorResult.output, session.worldState, pack);
```

With:

```ts
const directorBoundary = enforceDirectorLaw(directorResult.output, session.worldState, pack);
```

Keep narrator and character boundary imports unchanged.

- [ ] **Step 5: Verify law and regression tests**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/engine-v2/__tests__/director-law.test.ts src/engine-v2/__tests__/boundary.test.ts src/__tests__/api-v2.test.ts
corepack pnpm --filter @hushline/server check
```

Expected: all tests pass.

---

### Task 3: Add Turn Law Debug Metadata

**Files:**
- Modify: `packages/shared/src/engine-v2.ts`
- Modify: `packages/server/src/engine-v2/pipeline.ts`
- Modify: `packages/client/src/api-v2.ts`
- Test: `packages/server/src/__tests__/api-v2.test.ts`

- [ ] **Step 1: Write failing API test**

Add to `packages/server/src/__tests__/api-v2.test.ts`:

```ts
test("advance response includes developer-only state law snapshot", async () => {
  const app = createAppV2({ store: createSqliteStoreV2(":memory:"), scenariosDir });

  const createdResponse = await app.request("/api/v2/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioPackId: "locked-room-mystery",
      persona: { name: "한서윤" },
    }),
  });
  expect(createdResponse.status).toBe(201);
  const created = await createdResponse.json();

  const advancedResponse = await app.request(`/api/v2/sessions/${created.session.id}/advance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "지금 나가도 되나요?", inputMode: "chat" }),
  });
  expect(advancedResponse.status).toBe(200);
  const advanced = await advancedResponse.json();

  expect(advanced.turn.stateLaw).toBeDefined();
  expect(advanced.turn.stateLaw.immutableFacts.length).toBeGreaterThan(0);
  expect(advanced.turn.stateLaw.outputRules).toContain("유저 행동/생각/감정 대리 금지");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/__tests__/api-v2.test.ts
```

Expected: FAIL because `turn.stateLaw` is absent.

- [ ] **Step 3: Add shared response field**

Modify `TurnResultV2` in `packages/shared/src/engine-v2.ts`:

```ts
stateLaw: StateLawSnapshot;
```

- [ ] **Step 4: Add state law to pipeline result**

Modify `packages/server/src/engine-v2/pipeline.ts`:

```ts
import { buildStateLawSnapshot } from "./state-law.js";
```

Near the return:

```ts
const stateLaw = buildStateLawSnapshot(nextWorldState, pack);

return {
  worldState: nextWorldState,
  messages: turnMessages,
  directorOutput,
  boundaryReport: mergeBoundaryReports(
    directorBoundary.report,
    narratorBoundary.report,
    ...characterBoundaryReports,
  ),
  stateLaw,
};
```

- [ ] **Step 5: Update client API type**

Modify `packages/client/src/api-v2.ts` so the parsed advance response includes `stateLaw` from shared types. Do not render it in the main play screen yet.

- [ ] **Step 6: Verify API and typecheck**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/__tests__/api-v2.test.ts
corepack pnpm --filter @hushline/server check
corepack pnpm --filter @hushline/client check
```

Expected: all pass.

---

### Task 4: Show State Law In DevPanel

**Files:**
- Modify: `packages/client/src/api-v2.ts`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/DevPanel.tsx`
- Modify: `packages/client/src/utils/ui-helpers.ts`
- Test: `packages/client/tests/ui-helpers.test.ts`

- [ ] **Step 1: Write failing UI data test**

Add this pure helper in `packages/client/src/utils/ui-helpers.ts`:

```ts
export function summarizeStateLawForDevPanel(stateLaw: StateLawSnapshot | null | undefined): string[] {
  if (!stateLaw) return [];
  return [
    ...stateLaw.immutableFacts.map((item) => `고정: ${item}`),
    ...stateLaw.scenePressure.map((item) => `압력: ${item}`),
    ...stateLaw.outputRules.map((item) => `규칙: ${item}`),
  ];
}
```

Add test in `packages/client/tests/ui-helpers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/ui-helpers.test.ts
```

Expected: FAIL because helper is missing.

- [ ] **Step 3: Add helper and DevPanel prop**

Modify `packages/client/src/components/DevPanel.tsx` to accept:

```ts
stateLaw?: StateLawSnapshot | null;
```

Render only inside DevPanel:

```tsx
{stateLaw ? (
  <section className="dev-panel-section">
    <h3>Director Law</h3>
    <ul>
      {summarizeStateLawForDevPanel(stateLaw).map((row) => (
        <li key={row}>{row}</li>
      ))}
    </ul>
  </section>
) : null}
```

Use existing DevPanel class names if the file already has section/list styles.

- [ ] **Step 4: Pass latest turn state law from App**

Modify `packages/client/src/App.tsx` to store the most recent `turn.stateLaw` from advance responses, similar to existing `boundaryReport`.

Do not show any state law badge in `VisualNovelMainScreen` or `PhoneSubScreen`.

- [ ] **Step 5: Verify UI checks**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/ui-helpers.test.ts
corepack pnpm --filter @hushline/client check
corepack pnpm --filter @hushline/client build
```

Expected: all pass.

---

### Task 5: Add Director Law Page Skeleton

**Files:**
- Modify: `packages/client/src/App.tsx`
- Create: `packages/client/src/components/DirectorLawPanel.tsx`
- Modify: `packages/client/src/styles.css`
- Test: `packages/client/tests/director-law-panel.test.ts`

- [ ] **Step 1: Write pure model test**

Create `packages/client/tests/director-law-panel.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildDirectorLawSections } from "../src/components/DirectorLawPanel";

describe("DirectorLawPanel model", () => {
  test("groups state law into editable-looking sections without mutating state", () => {
    const sections = buildDirectorLawSections({
      immutableFacts: ["시나리오: 설산 산장 살인사건"],
      slowState: ["강무진: 신뢰도 0"],
      scenePressure: ["긴장 6 / 위험 3"],
      outputRules: ["유저 행동/생각/감정 대리 금지"],
    });

    expect(sections.map((section) => section.title)).toEqual([
      "고정 사실",
      "느린 상태",
      "장면 압력",
      "출력 규칙",
    ]);
    expect(sections[0]?.items).toContain("시나리오: 설산 산장 살인사건");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/director-law-panel.test.ts
```

Expected: FAIL because component module does not exist.

- [ ] **Step 3: Create panel module**

Create `packages/client/src/components/DirectorLawPanel.tsx`:

```tsx
import type { StateLawSnapshot } from "@hushline/shared";

export function buildDirectorLawSections(stateLaw: StateLawSnapshot) {
  return [
    { title: "고정 사실", items: stateLaw.immutableFacts },
    { title: "느린 상태", items: stateLaw.slowState },
    { title: "장면 압력", items: stateLaw.scenePressure },
    { title: "출력 규칙", items: stateLaw.outputRules },
  ];
}

export function DirectorLawPanel({ stateLaw }: { stateLaw: StateLawSnapshot | null | undefined }) {
  if (!stateLaw) {
    return null;
  }

  return (
    <aside className="director-law-panel" aria-label="Director Law">
      {buildDirectorLawSections(stateLaw).map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
```

- [ ] **Step 4: Add navigation without replacing model panel**

Modify `packages/client/src/App.tsx` to allow DevPanel/connection panel mode switching only in developer tools. Keep normal VN and phone screens unchanged.

Add this state:

```ts
const [rightToolMode, setRightToolMode] = useState<"connections" | "law">("connections");
```

Render `DirectorLawPanel` only when `rightToolMode === "law"`.

- [ ] **Step 5: Style as utilitarian tool, not landing page**

Add to `packages/client/src/styles.css`:

```css
.director-law-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  color: var(--vn-stage-text);
}

.director-law-panel section {
  display: grid;
  gap: 8px;
}

.director-law-panel h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--vn-stage-muted);
}

.director-law-panel ul {
  margin: 0;
  padding-left: 16px;
}
```

- [ ] **Step 6: Verify**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests/director-law-panel.test.ts
corepack pnpm --filter @hushline/client check
corepack pnpm --filter @hushline/client build
```

Expected: all pass.

---

### Task 6: Dependency And Session Friction Guardrails

**Files:**
- Modify: `packages/shared/src/engine-v2.ts`
- Modify: `packages/server/src/engine-v2/state-law.ts`
- Modify: `packages/server/src/engine-v2/director-law.ts`
- Test: `packages/server/src/engine-v2/__tests__/director-law.test.ts`

- [ ] **Step 1: Write failing guardrail test**

Add to `director-law.test.ts`:

```ts
test("adds exit ramp output rule when scene pressure stays high for repeated turns", () => {
  const worldState = {
    ...makeWorldState(),
    tension: 9,
    danger: 8,
    recentEvents: [
      { id: "e1", turnNumber: 1, description: "추궁이 계속됐다.", affectedCharacterIds: ["kang-mujin"] },
      { id: "e2", turnNumber: 2, description: "추궁이 계속됐다.", affectedCharacterIds: ["kang-mujin"] },
      { id: "e3", turnNumber: 3, description: "추궁이 계속됐다.", affectedCharacterIds: ["kang-mujin"] },
    ],
  };

  const { stateLaw } = enforceDirectorLaw(makeSafeDirectorOutput(), worldState, makePack());

  expect(stateLaw.outputRules).toContain("장면 마무리 또는 감정적 이탈 선택지를 허용한다");
});

function makeSafeDirectorOutput(): DirectorOutput {
  return {
    speakers: ["kang-mujin"],
    silence: false,
    event: null,
    narratorInstruction: "공개적으로 보이는 긴장만 묘사한다.",
    characterIntents: {
      "kang-mujin": "공개된 정보만 바탕으로 짧게 반응한다.",
    },
    messagePlan: [{ kind: "character", speakerId: "kang-mujin" }],
    stateDelta: {},
    subObjectiveUpdate: null,
    relationshipUpdate: null,
    directives: [],
    delay: null,
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/engine-v2/__tests__/director-law.test.ts
```

Expected: FAIL because `enforceDirectorLaw` does not return `stateLaw` yet.

- [ ] **Step 3: Extend Director Law return shape**

Modify `packages/server/src/engine-v2/director-law.ts`:

```ts
import { buildStateLawSnapshot } from "./state-law.js";

export function enforceDirectorLaw(...) {
  const boundary = enforceDirectorBoundary(directorOutput, worldState, pack);
  const stateLaw = buildStateLawSnapshot(worldState, pack);
  return { ...boundary, stateLaw };
}
```

Update call sites to use `directorBoundary.output`, `directorBoundary.report`, and `directorBoundary.stateLaw`.

- [ ] **Step 4: Add high-pressure exit rule**

Modify `buildStateLawSnapshot`:

```ts
const outputRules = [
  "유저 행동/생각/감정 대리 금지",
  "허용되지 않은 장소 이동 금지",
  "조사 전 진상/범인/트릭 확정 금지",
  "나레이터의 캐릭터 대사 작성 금지",
  "캐릭터의 타인 대사/행동 작성 금지",
];

if (worldState.tension >= 8 && worldState.danger >= 7 && worldState.recentEvents.length >= 3) {
  outputRules.push("장면 마무리 또는 감정적 이탈 선택지를 허용한다");
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/engine-v2/__tests__/director-law.test.ts src/engine-v2/__tests__/state-law.test.ts src/__tests__/api-v2.test.ts
corepack pnpm --filter @hushline/server check
```

Expected: all pass.

---

## Execution Order

1. Task 1: State Law Snapshot
2. Task 2: Director Law wrapper and pipeline routing
3. Task 3: Turn debug metadata
4. Task 4: DevPanel state law visibility
5. Task 5: Director Law Page skeleton
6. Task 6: Session friction / exit ramp rule

Do not expand model slots until Tasks 1-4 are done. The model UI can stay as it is while the engine gains a visible state/law spine.

## Verification Gate

After all tasks:

```powershell
corepack pnpm --filter @hushline/server test src/engine-v2/__tests__/state-law.test.ts src/engine-v2/__tests__/director-law.test.ts src/engine-v2/__tests__/boundary.test.ts src/__tests__/api-v2.test.ts
corepack pnpm --filter @hushline/server check
corepack pnpm --filter @hushline/client exec bun test
corepack pnpm --filter @hushline/client check
corepack pnpm --filter @hushline/client build
```

Expected: all commands pass.

## Completion Criteria

- `WorldState` has a derived state law snapshot grouped into immutable facts, slow state, scene pressure, and output rules.
- Director output goes through `enforceDirectorLaw`, not just ad hoc boundary checks in the pipeline.
- API advance responses include developer-only state law metadata.
- DevPanel shows state law and boundary interventions without exposing them in the player VN/phone screens.
- A Director Law panel exists as the first version of the Law Page.
- High-pressure repeated scenes gain an exit-ramp output rule.
- Existing model slots remain peer-level tools, not the primary product surface.
