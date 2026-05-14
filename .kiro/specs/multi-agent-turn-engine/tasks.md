# Tasks — Multi-Agent Turn Engine v2

## Task 1: Shared Types & Schemas
- [ ] Define WorldState, CharacterState, RelationshipEdge, Objective, SubObjective, NarrativeEvent interfaces in `@hushline/shared`
- [ ] Define DirectorOutput interface and Zod validation schema
- [ ] Define PublicContext, PrivateHandout, OmniscientContext interfaces
- [ ] Define ScenarioPack manifest schema (id, title, genre, version, engineVersion, uiMode)
- [ ] Add InputMode type (already exists, verify compatibility)
- [ ] Add AgentSlot type ("director" | "narrator" | characterId)

## Task 2: Scenario Pack Loader
- [ ] Create `engine-v2/scenario-loader.ts`
- [ ] Implement manifest.json loading + Zod validation
- [ ] Implement scenario-card.json loading (spaceRules, chatRules, toneRules, hardNos, backgrounds, openingBeats)
- [ ] Implement characters/*.json loading (profile + handout + systemPrompt + relationships)
- [ ] Implement prompts/director.txt and prompts/narrator.txt loading
- [ ] Implement objectives/main.json loading
- [ ] Implement events/triggers.json loading (optional file)
- [ ] Add configurable scenario pack directory path
- [ ] Write validation error reporting (specific field-level errors)
- [ ] Migrate existing `scenarios.ts` hardcoded data into a file-based pack at `scenarios/school-life-anomaly/`

## Task 3: Context Builder
- [ ] Create `engine-v2/context-builder.ts`
- [ ] Implement `buildPublicContext(state)` — shared chat log (last N), location, tension, danger, public events
- [ ] Implement `buildOmniscientContext(state)` — all secrets, all desires, full relationship graph, objectives, event triggers, genre goals
- [ ] Implement `buildPrivateHandout(characterId, state)` — character's own secret, desire, objective, knownFacts, own relationship edges, autonomy
- [ ] Implement `buildCharacterSummaries(state)` — id, name, autonomy, objective summary (for Director)
- [ ] Ensure no cross-contamination: private data never leaks into public/narrator context

## Task 4: State Manager
- [ ] Create `engine-v2/state-manager.ts`
- [ ] Implement `createInitialWorldState(scenarioPack)` — from loaded pack data
- [ ] Implement `applyStateDelta(state, directorOutput.stateDelta)` — clamp tension 0-10, danger 0-10
- [ ] Implement `updateCharacterState(state, characterId, updates)` — lastSpokeTurn, knownFacts append
- [ ] Implement `updateRelationshipGraph(state, relationshipUpdate)` — add/modify edges, clamp intensity 0-10
- [ ] Implement `updateSubObjectives(state, subObjectiveUpdate)` — create/progress/complete/fail
- [ ] Implement `addNarrativeEvent(state, event)` — append to recentEvents, trim to last 20

## Task 5: Input Classifier
- [ ] Create `engine-v2/input-classifier.ts`
- [ ] Move existing `detectInputMode()` and `stripInputModePrefix()` from old engine
- [ ] Ensure text convention patterns are preserved (*action*, (whisper), //action, /me)
- [ ] Export clean interface: `classifyInput(raw, explicitMode?) → { mode, content }`

## Task 6: Output Sanitizer
- [ ] Create `engine-v2/output-sanitizer.ts`
- [ ] Move `stripSpeakerPrefix`, `truncateAtForeignLabel`, `stripLeadingNarration`, `looksLikeNarration` from old engine
- [ ] Move `truncateNarratorAtCharacterLabel` from old engine
- [ ] Add `sanitizeCharacterOutput(raw, character) → string`
- [ ] Add `sanitizeNarratorOutput(raw) → string`
- [ ] Add `validateDirectorJson(raw) → DirectorOutput | null` (parse + schema check)

## Task 7: Director Agent Module
- [ ] Create `engine-v2/director.ts`
- [ ] Implement `buildDirectorSystemPrompt(scenarioPack, omniscientContext, genreGoals)` — structured prompt with JSON schema instruction
- [ ] Implement `buildDirectorMessages(publicContext, userInput, inputMode)` — recent chat as context
- [ ] Implement `invokeDirector(connection, prompt, messages) → DirectorOutput` — API call + JSON parse + validation
- [ ] Implement `makeFallbackDirectorOutput(state)` — safe default when API fails or JSON invalid
- [ ] Inject genre-specific goal text based on manifest.genre

## Task 8: Narrator Agent Module
- [ ] Create `engine-v2/narrator.ts`
- [ ] Implement `buildNarratorSystemPrompt(scenarioPack, publicContext, directorInstruction, inputMode)`
- [ ] Implement `buildNarratorMessages(publicContext, userInput, inputMode)`
- [ ] Implement `invokeNarrator(connection, prompt, messages) → string | null` — API call + sanitize
- [ ] Implement `makeFallbackNarration(state, inputMode)` — location-based one-liner
- [ ] Skip invocation when directorOutput.narratorInstruction is null and inputMode is not action

## Task 8: Character Agent Module
- [ ] Create `engine-v2/character.ts`
- [ ] Implement `buildCharacterSystemPrompt(character, privateHandout, directorIntent, inputMode, publicContext, scenarioPack)`
- [ ] Include autonomy guideline text based on autonomy score
- [ ] Implement `buildCharacterMessages(publicContext, characterId)` — last 12 messages with labeled format
- [ ] Implement `invokeCharacter(connection, prompt, messages) → ActorReply` — API call + sanitize
- [ ] Implement `makeFallbackCharacterReply(characterId, input)` — dry-run placeholder

## Task 9: Turn Pipeline Orchestrator
- [ ] Create `engine-v2/pipeline.ts`
- [ ] Implement `runTurnV2(state, userInput, options) → TurnResult` — main entry point
- [ ] Step 1: Input classification
- [ ] Step 2: Context assembly (public, omniscient, per-character)
- [ ] Step 3: Director invocation + validation + fallback
- [ ] Step 4: Narrator invocation (conditional on directorOutput)
- [ ] Step 5: Character invocations (parallel for 2 speakers)
- [ ] Step 6: Handle silence directive (skip characters)
- [ ] Step 7: Handle delay directive (pass to response)
- [ ] Step 8: State update (apply all deltas)
- [ ] Step 9: Message assembly + persist
- [ ] Wire connection routing: director=connections.director ?? default, narrator=connections.narrator ?? default, character=connections[charId] ?? default

## Task 10: API Layer Update
- [ ] Add `POST /api/v2/sessions` — creates session from scenarioPackId
- [ ] Add `POST /api/v2/sessions/:id/advance` — uses pipeline.ts
- [ ] Add `POST /api/v2/sessions/:id/reroll` — undo + re-advance
- [ ] Add `POST /api/v2/sessions/:id/undo` — remove last turn
- [ ] Add `GET /api/v2/scenarios` — list available scenario packs
- [ ] Update session creation to load scenario pack and initialize WorldState
- [ ] Keep v1 endpoints working during migration

## Task 11: Scenario Pack Migration
- [ ] Create `scenarios/school-life-anomaly/manifest.json`
- [ ] Create `scenarios/school-life-anomaly/scenario-card.json` (from existing defaultScenarioCard)
- [ ] Create `scenarios/school-life-anomaly/characters/advisor-1.json` (from existing defaultCharacters)
- [ ] Create `scenarios/school-life-anomaly/characters/advisor-2.json`
- [ ] Create `scenarios/school-life-anomaly/prompts/director.txt`
- [ ] Create `scenarios/school-life-anomaly/prompts/narrator.txt`
- [ ] Create `scenarios/school-life-anomaly/objectives/main.json`
- [ ] Create `scenarios/school-life-anomaly/events/triggers.json`

## Task 12: Client Connection Panel Update
- [ ] Add "Director" and "Narrator" slot tabs to ConnectionPanel
- [ ] Update `buildConnectionSlots()` to include director/narrator slots
- [ ] Update `activeConnections()` to pass director/narrator keys to server
- [ ] Preserve existing character slot functionality

## Task 13: Client v2 Integration
- [ ] Switch advance/reroll/undo calls to v2 endpoints (behind feature flag or direct swap)
- [ ] Handle `delay` field in response — add artificial pause before displaying messages
- [ ] Handle `silence` turns — show typing indicator that fades, or "read" indicator
- [ ] Display DirectorOutput debug info in dev mode (optional panel)
- [ ] Update session restore to work with v2 WorldState structure

## Task 14: Testing
- [ ] Unit tests for scenario-loader (valid pack, invalid pack, missing files)
- [ ] Unit tests for context-builder (no cross-contamination)
- [ ] Unit tests for state-manager (clamping, relationship updates)
- [ ] Unit tests for output-sanitizer (all strip/truncate cases)
- [ ] Unit tests for director JSON validation (valid, malformed, partial)
- [ ] Integration test: full pipeline dry-run (no API, all fallbacks)
- [ ] Integration test: full pipeline with mocked API responses
- [ ] Integration test: reroll and undo with WorldState consistency

## Task 15: Cleanup & Migration Complete
- [ ] Remove old `engine/` directory once v2 is stable
- [ ] Remove v1 API endpoints
- [ ] Update root package.json scripts if needed
- [ ] Final type check pass (`pnpm run check`)
