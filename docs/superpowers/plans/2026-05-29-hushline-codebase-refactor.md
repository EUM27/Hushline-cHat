# Hushline Codebase Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the largest Hushline client, server, and shared contract files while preserving current behavior, API shapes, provider neutrality, and visual layout.

**Architecture:** Use behavior-preserving extraction only. Keep public imports stable first, then move responsibilities behind barrels, presenters, route modules, and pure runtime helpers. Do not redesign provider hierarchy, session payloads, or visual layout during the refactor.

**Tech Stack:** pnpm workspace, TypeScript 5.9, React 19, Vite 7, Bun test runner, Hono, Zod, local CSS modules via imported CSS files.

---

## Current Baseline

- Worktree is dirty before this plan. Treat every existing modification and untracked file as user-owned.
- No staged files and no merge-conflict files were detected.
- Current verification passed:
  - `corepack pnpm check`
  - `corepack pnpm test`
  - `corepack pnpm --filter @hushline/client exec bun test tests`
  - `corepack pnpm --filter @hushline/client build`
- Biggest files by line count:
  - `packages/client/src/styles.css`: 2052 lines
  - `packages/shared/src/engine-v2.ts`: about 1000+ lines of shared contracts
  - `packages/client/src/App.tsx`: 877 lines
  - `packages/server/src/app-v2.ts`: 850 lines
  - `packages/server/src/engine/turn-engine.ts`: 834 lines, legacy v1 engine
  - `packages/server/src/engine-v2/pipeline.ts`: 794 lines
  - `packages/client/src/utils/ui-helpers.ts`: 586 lines
- Project guardrails from `CODEX.md`:
  - ChatGPT/OpenAI must stay a peer provider, not a protagonist/default.
  - No layout fixes by magic widths, viewport-height hacks, absolute offsets, or unexplained fixed numbers.

## Success Criteria

- No behavior change in API responses, session DTOs, provider status labels, message provenance, scenario loading, or generated turn flow.
- `App.tsx`, `app-v2.ts`, `pipeline.ts`, `engine-v2.ts`, and `styles.css` each become smaller because responsibilities moved into named modules.
- Existing tests still pass after each task.
- New tests cover newly exported pure helpers where extraction creates a stable seam.
- Every task can be reverted independently.

## File Structure Map

### Client UI Extraction

- Modify: `packages/client/src/App.tsx`
- Create: `packages/client/src/components/AppToolStrip.tsx`
- Create: `packages/client/src/components/ScenarioShell.tsx`
- Create: `packages/client/src/components/setup/ScenarioSetupPanel.tsx`
- Create: `packages/client/src/components/setup/PersonaSetupPanel.tsx`
- Create: `packages/client/src/components/setup/AdvisorSetupPanel.tsx`
- Create: `packages/client/src/hooks/useBootData.ts`
- Create: `packages/client/src/hooks/useScenarioSelection.ts`
- Create: `packages/client/src/hooks/useModelConnections.ts`
- Create: `packages/client/src/hooks/useSessionActions.ts`
- Keep: `packages/client/src/components/VisualNovelMainScreen.tsx`, `PhoneSubScreen.tsx`, `ConnectionPanel.tsx`, `DevPanel.tsx`, `DirectorLawPanel.tsx`

### Client CSS Extraction

- Modify: `packages/client/src/styles.css`
- Create: `packages/client/src/styles/base.css`
- Create: `packages/client/src/styles/app-shell.css`
- Create: `packages/client/src/styles/chat.css`
- Create: `packages/client/src/styles/connections.css`
- Create: `packages/client/src/styles/setup.css`
- Create: `packages/client/src/styles/invitation.css`
- Create: `packages/client/src/styles/dev-panel.css`
- Create: `packages/client/src/styles/visual-novel.css`
- Create: `packages/client/src/styles/responsive.css`

### Shared Contract Extraction

- Modify: `packages/shared/src/engine-v2.ts`
- Create: `packages/shared/src/engine-v2/base.ts`
- Create: `packages/shared/src/engine-v2/director.ts`
- Create: `packages/shared/src/engine-v2/case.ts`
- Create: `packages/shared/src/engine-v2/scenario.ts`
- Create: `packages/shared/src/engine-v2/session.ts`
- Create: `packages/shared/src/engine-v2/reveal.ts`
- Keep: `packages/shared/src/index.ts`

### Server App Extraction

- Modify: `packages/server/src/app-v2.ts`
- Create: `packages/server/src/app-v2/schemas.ts`
- Create: `packages/server/src/app-v2/session-presenter.ts`
- Create: `packages/server/src/app-v2/advisor-drafts.ts`
- Create: `packages/server/src/app-v2/persona-maker.ts`
- Create: `packages/server/src/app-v2/session-routes.ts`
- Create: `packages/server/src/app-v2/maker-routes.ts`
- Create: `packages/server/src/app-v2/__tests__/session-presenter.test.ts`

### Engine Pipeline Extraction

- Modify: `packages/server/src/engine-v2/pipeline.ts`
- Create: `packages/server/src/engine-v2/turn-runtime.ts`
- Create: `packages/server/src/engine-v2/case-runtime.ts`
- Create: `packages/server/src/engine-v2/message-composer.ts`
- Create: `packages/server/src/engine-v2/generation-model.ts`
- Create: `packages/server/src/engine-v2/pack-reconstructor.ts`
- Create: `packages/server/src/engine-v2/__tests__/message-composer.test.ts`

---

## Task 0: Freeze Baseline And Ownership

**Files:**
- Read only: whole repo

- [ ] **Step 1: Confirm no conflict state**

Run:

```powershell
git status --short
git diff --cached --name-only
git diff --name-only --diff-filter=U
```

Expected:

```text
No staged files.
No conflict files.
Existing modified/untracked files are treated as user-owned.
```

- [ ] **Step 2: Record current checks before editing**

Run:

```powershell
corepack pnpm check
corepack pnpm test
corepack pnpm --filter @hushline/client exec bun test tests
corepack pnpm --filter @hushline/client build
```

Expected:

```text
All commands pass before the first refactor commit.
```

- [ ] **Step 3: Commit or isolate the refactor work**

Recommended command after the user-owned WIP is either committed or intentionally kept:

```powershell
git switch -c codex/hushline-codebase-refactor
```

Expected:

```text
Refactor changes are isolated from unrelated WIP.
```

---

## Task 1: Extract App Shell Presentational Components

**Files:**
- Modify: `packages/client/src/App.tsx`
- Create: `packages/client/src/components/AppToolStrip.tsx`
- Create: `packages/client/src/components/ScenarioShell.tsx`
- Create: `packages/client/src/components/setup/ScenarioSetupPanel.tsx`
- Create: `packages/client/src/components/setup/PersonaSetupPanel.tsx`
- Create: `packages/client/src/components/setup/AdvisorSetupPanel.tsx`

- [ ] **Step 1: Move `AppToolStrip` without changing props**

Create `packages/client/src/components/AppToolStrip.tsx`:

```tsx
import { Settings, Wrench } from "lucide-react";

export interface AppToolStripProps {
  placement: "inline" | "floating";
  isConnectionPanelOpen: boolean;
  isDevPanelOpen: boolean;
  showDevTools: boolean;
  onToggleConnectionPanel: () => void;
  onToggleDevPanel: () => void;
}

export function AppToolStrip({
  placement,
  isConnectionPanelOpen,
  isDevPanelOpen,
  showDevTools,
  onToggleConnectionPanel,
  onToggleDevPanel,
}: AppToolStripProps) {
  return (
    <div
      className={`app-tool-strip ${placement} ${isConnectionPanelOpen || isDevPanelOpen ? "overlay-open" : ""}`}
      aria-label="앱 도구"
    >
      <button
        type="button"
        className={`app-tool-toggle ${isConnectionPanelOpen ? "active" : ""}`}
        aria-label={isConnectionPanelOpen ? "모델 설정 닫기" : "모델 설정 열기"}
        aria-expanded={isConnectionPanelOpen}
        onClick={onToggleConnectionPanel}
        title="모델 설정"
      >
        <Settings size={18} aria-hidden="true" />
      </button>
      {showDevTools ? (
        <button
          type="button"
          className={`app-tool-toggle ${isDevPanelOpen ? "active" : ""}`}
          aria-label={isDevPanelOpen ? "개발자 패널 닫기" : "개발자 패널 열기"}
          aria-expanded={isDevPanelOpen}
          onClick={onToggleDevPanel}
          title="개발자 패널"
        >
          <Wrench size={18} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Move `ScenarioShell` without changing classes**

Create `packages/client/src/components/ScenarioShell.tsx`:

```tsx
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
```

- [ ] **Step 3: Move setup JSX into three setup panels**

Use prop objects rather than pulling React state into the child components. The extracted components should receive exactly the data and callbacks they render:

```tsx
export interface ScenarioSetupPanelProps {
  scenarioList: string[];
  isScenarioListLoading: boolean;
  scenarioListError: string | null;
  selectedScenario: string;
  selectedScenarioDetail: V2ScenarioDetailResponse | null;
  error: string | null;
  onSelectScenario: (scenarioId: string) => void;
  onNext: () => void;
}
```

```tsx
export interface PersonaSetupPanelProps {
  personaName: string;
  hasScenarioAdvisors: boolean;
  isStarting: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}
```

```tsx
export interface AdvisorSetupPanelProps {
  advisors: AdvisorDraft[];
  isStarting: boolean;
  error: string | null;
  onBack: () => void;
  onRegenerate: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}
```

- [ ] **Step 4: Update `App.tsx` imports and remove local component definitions**

Expected result:

```text
App.tsx still owns state and handlers, but setup/shell/tool rendering has moved out.
No text, provider order, icon hierarchy, or layout class changes.
```

- [ ] **Step 5: Verify**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests
corepack pnpm --filter @hushline/client build
corepack pnpm check
```

Expected:

```text
Client tests, build, and typecheck pass.
```

- [ ] **Step 6: Commit**

```powershell
git add packages/client/src/App.tsx packages/client/src/components/AppToolStrip.tsx packages/client/src/components/ScenarioShell.tsx packages/client/src/components/setup
git commit -m "refactor(client): extract app shell panels"
```

---

## Task 2: Extract App State Hooks

**Files:**
- Modify: `packages/client/src/App.tsx`
- Create: `packages/client/src/hooks/useBootData.ts`
- Create: `packages/client/src/hooks/useScenarioSelection.ts`
- Create: `packages/client/src/hooks/useModelConnections.ts`
- Create: `packages/client/src/hooks/useSessionActions.ts`

- [ ] **Step 1: Extract boot data**

Create `useBootData` to own assets, provider profiles, restored session, and initial boot errors:

```tsx
export interface BootDataState {
  assets: AssetManifest | null;
  providerProfiles: ProviderProfile[];
  bootError: string | null;
  restoredSession: ClientSessionState | null;
}

export function useBootData(): BootDataState {
  // Move the current App boot effect here without changing fetch URLs:
  // /api/assets, /api/provider-profiles, and getSessionV2(savedSessionId).
}
```

Implementation requirement:

```text
Keep localStorage key usage identical through sessionStorageKey.
Do not introduce a new request library or cache layer.
```

- [ ] **Step 2: Extract scenario selection**

Create `useScenarioSelection` to own scenario list loading, selected scenario, selected detail, and setup step transitions:

```tsx
export type SetupStep = "scenario" | "persona" | "advisors";

export interface ScenarioSelectionState {
  setupStep: SetupStep;
  scenarioList: string[];
  isScenarioListLoading: boolean;
  scenarioListError: string | null;
  selectedScenario: string;
  selectedScenarioDetail: V2ScenarioDetailResponse | null;
  setSetupStep: (step: SetupStep) => void;
  setSelectedScenario: (scenarioId: string) => void;
  resetScenarioSelection: () => void;
}
```

- [ ] **Step 3: Extract model connection persistence**

Create `useModelConnections` to own connection state, model loading, OAuth status, manual save status, and connection save errors.

Required return surface:

```tsx
export interface ModelConnectionsState {
  connections: Record<string, ModelConnection>;
  modelOptions: Record<string, ModelOption[]>;
  modelLoadState: Record<string, { loading: boolean; error: string | null }>;
  oauthStatus: string | null;
  saveStatus: string;
  setConnections: (next: Record<string, ModelConnection>) => void;
  loadModels: (providerId: ModelProviderId, apiKey?: string) => Promise<void>;
  openChatGptLogin: () => Promise<void>;
  checkChatGptAccount: () => Promise<void>;
  saveConnections: () => void;
}
```

Provider-neutral rule:

```text
Do not change visible provider ordering, default slot behavior, or the generic "API 적용 중" label.
ChatGPT-specific text may remain only inside ChatGPT OAuth flow status.
```

- [ ] **Step 4: Extract session action handlers**

Create `useSessionActions` to own start, advance, reroll, undo, restart, new game, reveal count, and last developer traces.

Required invariant:

```text
appendOptimisticUserMessage still runs before /advance.
On request failure, restore the base session and the input text.
generation-time model labels still come from returned messages, not current connection state.
```

- [ ] **Step 5: Verify**

Run:

```powershell
corepack pnpm --filter @hushline/client exec bun test tests
corepack pnpm --filter @hushline/client build
corepack pnpm check
```

Expected:

```text
No client behavior or type regressions.
App.tsx is mostly composition and derived view state.
```

- [ ] **Step 6: Commit**

```powershell
git add packages/client/src/App.tsx packages/client/src/hooks
git commit -m "refactor(client): move app state into hooks"
```

---

## Task 3: Split The Global Stylesheet By Surface

**Files:**
- Modify: `packages/client/src/styles.css`
- Create: `packages/client/src/styles/base.css`
- Create: `packages/client/src/styles/app-shell.css`
- Create: `packages/client/src/styles/chat.css`
- Create: `packages/client/src/styles/connections.css`
- Create: `packages/client/src/styles/setup.css`
- Create: `packages/client/src/styles/invitation.css`
- Create: `packages/client/src/styles/dev-panel.css`
- Create: `packages/client/src/styles/visual-novel.css`
- Create: `packages/client/src/styles/responsive.css`

- [ ] **Step 1: Turn `styles.css` into the import manifest**

Replace `packages/client/src/styles.css` with only ordered imports:

```css
@import "./styles/base.css";
@import "./styles/app-shell.css";
@import "./styles/chat.css";
@import "./styles/connections.css";
@import "./styles/setup.css";
@import "./styles/invitation.css";
@import "./styles/dev-panel.css";
@import "./styles/visual-novel.css";
@import "./styles/responsive.css";
```

- [ ] **Step 2: Move sections by existing comment boundaries**

Move current sections as follows:

```text
Reset, root/body defaults -> base.css
App shell, scene wash, stage layout, scenario card -> app-shell.css
Chat frame, message log, bubbles, composer, input mode -> chat.css
Connection panel, drawer, model picker -> connections.css
Persona/advisor/scenario setup panels -> setup.css
Invitation panel and typing pulse -> invitation.css
Dev panel and developer summaries -> dev-panel.css
VN stage, phone, standee, command dock, dialogue, menu -> visual-novel.css
All @media blocks and responsive overrides -> responsive.css
```

- [ ] **Step 3: Preserve CSS tokens and selector names**

Expected:

```text
No selector rename in this task.
No magic width/height additions.
No palette or typography redesign.
```

- [ ] **Step 4: Verify CSS bundle and UI build**

Run:

```powershell
corepack pnpm --filter @hushline/client build
corepack pnpm --filter @hushline/client exec bun test tests
corepack pnpm check
```

Expected:

```text
Vite build includes the same app entry and emits a CSS asset.
Client tests and typecheck pass.
```

- [ ] **Step 5: Runtime visual smoke**

Run:

```powershell
corepack pnpm dev
```

Expected:

```text
Client starts on a free port starting from 4187.
API starts on a free port starting from 7871.
Setup screen, connection drawer, VN screen, and dev panel render with no overlap.
```

- [ ] **Step 6: Commit**

```powershell
git add packages/client/src/styles.css packages/client/src/styles
git commit -m "refactor(client): split stylesheet by surface"
```

---

## Task 4: Split Shared Engine V2 Contracts Behind A Barrel

**Files:**
- Modify: `packages/shared/src/engine-v2.ts`
- Create: `packages/shared/src/engine-v2/base.ts`
- Create: `packages/shared/src/engine-v2/director.ts`
- Create: `packages/shared/src/engine-v2/case.ts`
- Create: `packages/shared/src/engine-v2/scenario.ts`
- Create: `packages/shared/src/engine-v2/session.ts`
- Create: `packages/shared/src/engine-v2/reveal.ts`
- Keep: `packages/shared/src/index.ts`

- [ ] **Step 1: Create focused contract files**

Move types by responsibility:

```text
base.ts: AgentSlot, SceneMode, Objective, SubObjective, RelationshipEdge, NarrativeEvent, CharacterStateV2, WorldState
director.ts: DirectorStateDelta, DirectorDirective, DirectorMessagePlanItem, DirectorOutput, DirectorOutputV4, BoundaryReport, StateLawSnapshot
case.ts: FactId through CaseRuntimeTrace, claim ledger, deduction, contradiction, propagation, ambiguity types
scenario.ts: ScenarioGenre, ScenarioManifest, ScenarioOpeningBeatV2, ScenarioCardV2, CharacterDefinition, ScenarioPack, EventTrigger, ObjectiveDefinition
session.ts: TurnResultV2, TurnMessage, SessionStateV2, SceneSummary, WorldStateV2Extended, TurnOptionsV2
reveal.ts: FactVisibility, RevealLevel, RevealCondition, SceneOccurrenceDevice, RevealBudget
```

- [ ] **Step 2: Keep old import path stable**

Make `packages/shared/src/engine-v2.ts` a barrel:

```ts
export * from "./engine-v2/base.js";
export * from "./engine-v2/director.js";
export * from "./engine-v2/case.js";
export * from "./engine-v2/scenario.js";
export * from "./engine-v2/session.js";
export * from "./engine-v2/reveal.js";
```

- [ ] **Step 3: Fix intra-type imports**

Use type-only imports between contract files:

```ts
import type { WorldState } from "./base.js";
import type { CharacterDefinition, ScenarioPack } from "./scenario.js";
```

Expected:

```text
Existing imports from "@hushline/shared" and "./engine-v2.js" continue to compile.
No runtime imports are introduced for type-only contracts.
```

- [ ] **Step 4: Verify shared and downstream packages**

Run:

```powershell
corepack pnpm --filter @hushline/shared check
corepack pnpm check
corepack pnpm test
corepack pnpm --filter @hushline/client exec bun test tests
```

Expected:

```text
All packages still compile against the same public contract exports.
```

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/src/engine-v2.ts packages/shared/src/engine-v2
git commit -m "refactor(shared): split engine v2 contracts"
```

---

## Task 5: Extract App V2 Schemas, Presenters, And Route Modules

**Files:**
- Modify: `packages/server/src/app-v2.ts`
- Create: `packages/server/src/app-v2/schemas.ts`
- Create: `packages/server/src/app-v2/session-presenter.ts`
- Create: `packages/server/src/app-v2/advisor-drafts.ts`
- Create: `packages/server/src/app-v2/persona-maker.ts`
- Create: `packages/server/src/app-v2/session-routes.ts`
- Create: `packages/server/src/app-v2/maker-routes.ts`
- Create: `packages/server/src/app-v2/__tests__/session-presenter.test.ts`

- [ ] **Step 1: Move request schemas**

Create `schemas.ts` and export:

```ts
export const modelProviderIdSchema = z.enum(["nanogpt", "openrouter", "chatgpt"]);
export const modelConnectionSchema = z.object({
  providerId: modelProviderIdSchema,
  apiKey: z.string().trim().optional().default(""),
  model: z.string().trim().min(1),
  baseUrl: z.string().trim().url().optional(),
});
export const createSessionBodySchema = z.object({
  scenarioPackId: z.string().trim().min(1).max(120),
  persona: z.object({ name: z.string().trim().max(80).default("{{유저}}") }).optional(),
  advisors: z.array(advisorDraftSchema).min(1).max(4).optional(),
  connections: z.record(z.string(), modelConnectionSchema).optional(),
});
```

Also move the existing `oceanSchema`, `advisorHandoutSchema`, `advisorDraftSchema`, `personaDraftSchema`, `personaMakerBodySchema`, `advisorMakerBodySchema`, and `advanceBodySchema` into the same file.

- [ ] **Step 2: Move session presentation**

Move `toClientSession` into `session-presenter.ts`:

```ts
export function toClientSession(session: SessionStateV2, scenarioPack?: ScenarioPack): ClientSessionState {
  // Use the exact mapping from the current app-v2.ts.
}
```

Add focused presenter tests:

```ts
import { describe, expect, test } from "bun:test";
import { toClientSession } from "../session-presenter.js";

describe("toClientSession", () => {
  test("preserves generation-time messages and maps v2 world state to v1 scene aliases", () => {
    const clientSession = toClientSession(makeMinimalSession(), makeMinimalPack());
    expect(clientSession.scene.sessionId).toBe(clientSession.id);
    expect(clientSession.scenario.id).toBe(clientSession.scenarioPackId);
    expect(clientSession.messages[0]?.generationModel?.model).toBe("test-model");
  });
});
```

- [ ] **Step 3: Move advisor/persona draft helpers**

Move these helpers into `advisor-drafts.ts` and `persona-maker.ts`:

```text
advisor-drafts.ts: applyAdvisorDrafts, packWithSessionCharacters, advisorDraftToCharacterDefinition, buildAdvisorHandout, normalizeAdvisorDraft, normalizePartialHandout
persona-maker.ts: generatePersonaDraft, generateAdvisorDrafts, buildPersonaMakerPrompt, buildAdvisorMakerPrompt, fallbacks, parseJsonObject helpers
```

- [ ] **Step 4: Register route modules from `createAppV2`**

Keep `createAppV2` as the Hono composition root:

```ts
export function createAppV2(options: CreateAppV2Options = {}) {
  const store = options.store ?? createSqliteStoreV2();
  const scenariosDir = resolveScenarioDir(options.scenariosDir);
  const app = new Hono();

  registerMakerRoutes(app, { scenariosDir });
  registerSessionRoutes(app, { store, scenariosDir });
  return app;
}
```

Do not change route URLs:

```text
/api/v2/scenarios
/api/v2/scenarios/:packId
/api/v2/persona-maker/generate
/api/v2/advisor-maker/generate
/api/v2/sessions
/api/v2/sessions/:id
/api/v2/sessions/:id/advance
/api/v2/sessions/:id/reroll
/api/v2/sessions/:id/undo
```

- [ ] **Step 5: Verify server API compatibility**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/__tests__/api-v2.test.ts
corepack pnpm test
corepack pnpm check
```

Expected:

```text
All API v2 tests pass without snapshot or payload changes.
```

- [ ] **Step 6: Commit**

```powershell
git add packages/server/src/app-v2.ts packages/server/src/app-v2
git commit -m "refactor(server): split v2 app routes and presenters"
```

---

## Task 6: Split Engine V2 Turn Pipeline Into Pure Runtime Helpers

**Files:**
- Modify: `packages/server/src/engine-v2/pipeline.ts`
- Create: `packages/server/src/engine-v2/turn-runtime.ts`
- Create: `packages/server/src/engine-v2/case-runtime.ts`
- Create: `packages/server/src/engine-v2/message-composer.ts`
- Create: `packages/server/src/engine-v2/generation-model.ts`
- Create: `packages/server/src/engine-v2/pack-reconstructor.ts`
- Create: `packages/server/src/engine-v2/__tests__/message-composer.test.ts`

- [ ] **Step 1: Extract message composition**

Move `composeSceneMessages` into `message-composer.ts`:

```ts
import type { DirectorOutput, TurnMessage } from "@hushline/shared";

export function composeSceneMessages(
  directorOutput: DirectorOutput,
  narratorMessage: TurnMessage | null,
  characterMessages: TurnMessage[],
  systemMessage: TurnMessage | null,
): TurnMessage[] {
  // Use the exact current ordering logic from pipeline.ts.
}
```

Add tests:

```ts
import { describe, expect, test } from "bun:test";
import { composeSceneMessages } from "../message-composer.js";

describe("composeSceneMessages", () => {
  test("honors director message plan and appends no duplicate narrator or system messages", () => {
    const result = composeSceneMessages(makeDirectorOutputWithPlan(), makeNarrator(), [makeCharacter("a")], makeSystem());
    expect(result.map((message) => message.role)).toEqual(["character", "narrator", "system"]);
  });

  test("falls back to narrator, characters, then system when the plan is empty", () => {
    const result = composeSceneMessages(makeDirectorOutputWithoutPlan(), makeNarrator(), [makeCharacter("a")], makeSystem());
    expect(result.map((message) => message.role)).toEqual(["narrator", "character", "system"]);
  });
});
```

- [ ] **Step 2: Extract generation model helpers**

Move `getConnection` and `snapshotGenerationModel` into `generation-model.ts`:

```ts
export function getConnection(
  connections: Record<string, ModelConnection>,
  slot: string,
): ModelConnection | undefined {
  return connections[slot] ?? connections.default;
}

export function snapshotGenerationModel(connection: ModelConnection | undefined): GenerationModelSnapshot | undefined {
  if (!connection?.model) return undefined;
  return { providerId: connection.providerId, model: connection.model };
}
```

Invariant:

```text
Message badges must remain generation-time snapshots, not current connection panel state.
```

- [ ] **Step 3: Extract case runtime helpers**

Move these helpers into `case-runtime.ts`:

```text
isContradictionRecord
buildPressureByNpc
buildAllowedReactionByNpc
getPresentNpcIds
buildNpcKnowledgeDigest
buildNpcTrustLevels
makeNarratorGateReport
makeCharacterGateReport
```

- [ ] **Step 4: Extract narrator/system instruction helpers**

Move these helpers into `turn-runtime.ts`:

```text
getAllowedBackgroundIds
buildNarratorInstruction
shouldCreateSceneNarration
buildSystemMessageContent
formatStateDelta
```

- [ ] **Step 5: Extract pack reconstruction**

Move `reconstructPack` into `pack-reconstructor.ts`.

Keep the existing follow-up note visible:

```ts
// Follow-up: persist and reload full scenario pack metadata instead of reconstructing a minimal fallback pack.
```

- [ ] **Step 6: Verify pipeline behavior**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/engine-v2
corepack pnpm --filter @hushline/server test src/__tests__/api-v2.test.ts
corepack pnpm check
```

Expected:

```text
Engine v2 tests and API v2 tests pass.
pipeline.ts remains the turn orchestrator, but helper logic is no longer embedded at the bottom of the file.
```

- [ ] **Step 7: Commit**

```powershell
git add packages/server/src/engine-v2/pipeline.ts packages/server/src/engine-v2/turn-runtime.ts packages/server/src/engine-v2/case-runtime.ts packages/server/src/engine-v2/message-composer.ts packages/server/src/engine-v2/generation-model.ts packages/server/src/engine-v2/pack-reconstructor.ts packages/server/src/engine-v2/__tests__/message-composer.test.ts
git commit -m "refactor(engine-v2): extract turn pipeline helpers"
```

---

## Task 7: Decide Legacy V1 Engine Boundary

**Files:**
- Read: `packages/server/src/app.ts`
- Read: `packages/server/src/engine/turn-engine.ts`
- Read: `packages/server/src/engine/__tests__/turn-engine.test.ts`
- Optional modify: `packages/server/src/engine/README.md`

- [ ] **Step 1: Confirm whether v1 routes are still intentionally supported**

Run:

```powershell
rg -n "createApp\\(|runTurn\\(|runDryTurn\\(|/api/v1|engine/turn-engine" packages scripts docs
```

Expected:

```text
Every remaining v1 reference is either a supported compatibility path or dead code candidate.
```

- [ ] **Step 2: If v1 is supported, document the boundary**

Create `packages/server/src/engine/README.md`:

```markdown
# Legacy Engine Boundary

`packages/server/src/engine` is the v1 compatibility engine.

Do not move v2 case-knowledge, director-law, reveal-budget, or multi-agent turn code into this folder.
New runtime features should target `packages/server/src/engine-v2`.

Keep v1 tests passing until the v1 API route is intentionally removed.
```

- [ ] **Step 3: If v1 is dead, make a separate deletion plan**

Expected:

```text
Do not delete v1 in this refactor branch unless the user explicitly approves the removal.
```

- [ ] **Step 4: Verify**

Run:

```powershell
corepack pnpm --filter @hushline/server test src/engine
corepack pnpm test
corepack pnpm check
```

Expected:

```text
Legacy coverage remains green.
```

- [ ] **Step 5: Commit if documentation was added**

```powershell
git add packages/server/src/engine/README.md
git commit -m "docs(server): mark legacy engine boundary"
```

---

## Task 8: Final Integration And Runtime Smoke

**Files:**
- Read only unless a task-specific regression is found

- [ ] **Step 1: Run full verification**

Run:

```powershell
corepack pnpm check
corepack pnpm test
corepack pnpm --filter @hushline/client exec bun test tests
corepack pnpm --filter @hushline/client build
```

Expected:

```text
All checks pass.
```

- [ ] **Step 2: Run local app smoke**

Run:

```powershell
corepack pnpm dev
```

Expected:

```text
Client is reachable on the selected client port, usually 4187.
API is reachable on the selected API port, usually 7871.
```

Manual smoke checklist:

```text
Setup screen loads scenario list.
Provider connection panel keeps NanoGPT, OpenRouter, OpenAI/compatible, and ChatGPT-like options visually peer-ranked where present.
ChatGPT-specific OAuth controls appear only in the ChatGPT provider flow.
Session creation works.
Advance, reroll, undo, restart, and new game still work.
VN view and phone view do not overlap at desktop and mobile widths.
Developer panels still show boundary, state law, and case runtime summaries.
Message source badges use per-message generationModel.
```

- [ ] **Step 3: Compare size reduction**

Run:

```powershell
$files = rg --files packages -g '*.ts' -g '*.tsx' -g '*.css'
$rows = @()
foreach ($f in $files) {
  $rows += [pscustomobject]@{ Lines=(Get-Content -LiteralPath $f | Measure-Object -Line).Lines; File=$f }
}
$rows | Sort-Object Lines -Descending | Select-Object -First 20 | Format-Table -AutoSize
```

Expected:

```text
No single client UI or CSS file remains the obvious dumping ground.
The top files are either deliberate orchestration modules or contract barrels.
```

- [ ] **Step 4: Final diff review**

Run:

```powershell
git diff --stat
git diff -- packages/client/src/App.tsx packages/server/src/app-v2.ts packages/server/src/engine-v2/pipeline.ts packages/shared/src/engine-v2.ts packages/client/src/styles.css
```

Expected:

```text
Diff shows extraction and imports, not behavior rewrites.
```

---

## Execution Order

1. Task 0: Baseline and ownership.
2. Task 1: App shell extraction.
3. Task 2: App hooks.
4. Task 3: CSS split.
5. Task 4: Shared type contracts.
6. Task 5: App v2 server route extraction.
7. Task 6: Engine v2 pipeline helper extraction.
8. Task 7: Legacy v1 boundary decision.
9. Task 8: Final integration and runtime smoke.

## Risk Register

- `App.tsx` has active WIP and untracked `DirectorLawPanel.tsx`; extraction must inspect the current diff before editing.
- `styles.css` split is mechanically simple but visually risky. Do it without selector renames first.
- Shared type split can create circular type imports. Use `import type` and keep `engine-v2.ts` as the old barrel.
- `app-v2.ts` extraction must not change route URLs, HTTP status codes, or response shapes.
- `pipeline.ts` is behavior-sensitive. Extract only pure helper blocks first; leave orchestration order inside `runTurnV2`.
- `turn-engine.ts` is large but legacy. Do not delete or rewrite it during the first refactor pass.

## Self-Review

- Spec coverage: The plan covers the largest measured files, dirty-worktree safety, provider neutrality, layout guardrails, tests, and runtime smoke.
- Placeholder scan: The plan avoids empty future-fill markers and vague catch-all implementation steps.
- Type consistency: All new client imports remain under `packages/client/src`; shared contract exports continue through `@hushline/shared`; server extraction keeps `createAppV2` as the composition root.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-29-hushline-codebase-refactor.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh worker per task, review after each task, and keep the current dirty worktree protected.
2. **Inline Execution** - Execute tasks in this session with checkpoints after each task and full verification before continuing.
