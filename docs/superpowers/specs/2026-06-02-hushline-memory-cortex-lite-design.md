# Hushline Memory Cortex Lite Design

Date: 2026-06-02
Status: design approved for B option, pending implementation plan
Scope: Hushline cHat engine v2 long-term memory, diagnostics, and retrieval

## Goal

Build a Hushline-native hybrid memory layer inspired by Lumiverse Memory Cortex without copying its full product surface. The first slice should preserve Hushline's existing visibility boundaries while adding structured memory capture, entity and relationship indexing, salience scoring, per-turn retrieval traces, and read-only vault attachment for cross-chat continuity.

The system must improve long-running roleplay continuity without trusting the model to remember old turns from raw transcript context alone.

## Non-Goals

- Do not add an embedding provider, vector database, or sidecar LLM in the first slice.
- Do not store memory state inside `SessionStateV2.state_json`.
- Do not expose hidden truth, private handouts, or Director-only knowledge to Character or Narrator prompts.
- Do not implement live bidirectional interlink between active sessions in the first slice.
- Do not redesign the main UI; diagnostics belong in the existing DevPanel first.

## Current System Anchors

Hushline already has several memory-adjacent primitives:

- `SessionStateV2.messages`, `summaries`, and `turnCheckpoints` preserve turn history and rollback boundaries.
- `WorldState.relationshipGraph`, `recentEvents`, `sceneSnapshots`, and `encounteredCharacters` capture structured runtime state.
- `runTurnV2` has a clear context assembly phase before Director/Narrator/Character calls.
- `/api/v2/sessions/:id/advance` and `/reroll` already rebuild and persist the next session after each turn.
- DevPanel already shows boundary reports, Director Law, Case Runtime, world state, relationship graph, character states, and recent events.

The Cortex layer should reuse these signals rather than re-extracting everything from prose.

## Recommended Architecture

Use a separate SQLite-backed `MemoryCortexStore` beside `sessions_v2`.

The memory store is independent from the session JSON blob so it can be rebuilt, inspected, compacted, and tested without rewriting saved sessions. The store should live under the same database path and be initialized by the server store layer.

Core modules:

- `packages/shared/src/engine-v2/memory-cortex.ts`
  Shared types for chunks, entities, relations, salience, retrieval results, traces, and vault references.
- `packages/server/src/engine-v2/memory-cortex.ts`
  Pure ingestion, extraction, scoring, and retrieval helpers.
- `packages/server/src/store/memory-cortex-store.ts`
  SQLite schema, CRUD, FTS search, transaction helpers, and rebuild support.
- `packages/server/src/app-v2/memory-routes.ts`
  Dev-facing endpoints for retrieval traces, manual entity/relation edits, and vault attachment.
- Client additions should be small and limited to DevPanel diagnostics in the first slice.

## Data Model

The first schema should include:

- `memory_chunks`
  One chunk per user/narrator/character/system message or compact event. Fields: `id`, `session_id`, `scenario_pack_id`, `turn_number`, `message_id`, `role`, `speaker_id`, `speaker_label`, `content`, `summary`, `importance`, `emotion`, `visibility`, `created_at`.
- `memory_entities`
  Canonical entity records. Fields: `id`, `session_id`, `canonical_name`, `kind`, `aliases_json`, `character_id`, `first_seen_turn`, `last_seen_turn`, `salience`, `is_user_persona`.
- `memory_relations`
  Relationship assertions or state links. Fields: `id`, `session_id`, `source_entity_id`, `target_entity_id`, `relation_type`, `descriptor`, `intensity`, `confidence`, `evidence_chunk_ids_json`, `updated_turn`.
- `memory_chunk_entities`
  Many-to-many chunk/entity references with `role_in_memory`.
- `memory_retrieval_traces`
  Last-N retrieval evidence for diagnostics. Fields: `id`, `session_id`, `turn_number`, `query_json`, `candidate_ids_json`, `selected_ids_json`, `scores_json`, `created_at`.
- `memory_vaults`
  Read-only exported memory bundles. Fields: `id`, `title`, `source_session_id`, `scenario_pack_id`, `summary`, `entities_json`, `relations_json`, `core_chunks_json`, `created_at`.
- `memory_vault_links`
  Session-to-vault attachment. Fields: `session_id`, `vault_id`, `mode`, `created_at`.

For text retrieval, use SQLite FTS over chunk `content` and `summary`, then combine BM25-like text match with structured scores.

## Ingestion Flow

On create-session:

- Index opening beats.
- Seed entities from scenario characters, persona name/short name, character aliases, relationship tags, and initial relationship graph.
- Mark seeded entities as high-confidence but not necessarily high-importance.

On advance:

- Run the turn normally first.
- After `turnResult` is produced and before `store.saveSession(nextSession)`, ingest the accepted turn messages plus structured deltas.
- Use `DirectorOutput.relationshipUpdate`, `WorldState.recentEvents`, `caseRuntime`, `speakerIds`, and message metadata as extraction signals.
- Store retrieval/ingestion trace separately from visible session state.

On reroll:

- Roll back message/session state as today.
- Mark memory rows tied to discarded message ids or discarded turn checkpoints as superseded, or delete them in a transaction.
- Ingest replacement messages after the new result is accepted.

On undo:

- Remove or supersede memory rows after the restored turn boundary.

## Extraction Rules

MVP extraction should be deterministic:

- Entity candidates come from known characters, persona aliases, speaker labels, explicit names in user input, and scenario-defined aliases.
- Relationship candidates come from existing `relationshipGraph`, `DirectorOutput.relationshipUpdate`, character-state relationship-to-user changes, and explicit relationship tags.
- Importance is a score from structured events:
  - relationship update or objective progress: high
  - new entity first seen: medium
  - hidden-truth-safe case fact revealed: high
  - repeated small talk: low
  - user-authored persona/relationship correction: high
- Emotion can start as a small enum from tension/danger deltas and surface markers, not a model call.

This keeps the first slice provider-neutral and avoids making any model family a privileged memory backend.

## Retrieval Flow

Before context assembly in `runTurnV2`:

- Build a retrieval query from user input, input mode, scenario id, current location, active speaker candidate, recent speaker ids, and visible entity aliases.
- Retrieve top candidates from:
  - recent chunks
  - FTS/BM25 text matches
  - chunks linked to mentioned entities
  - high-salience relationship or objective memories
  - attached read-only vault summaries
- Score with:
  - text relevance
  - entity overlap
  - relationship relevance
  - salience
  - recency
  - visibility compatibility

Inject results as structured memory context:

- Director: may receive public plus omniscient-safe memory summaries, excluding hidden truth prose unless already allowed by existing case runtime.
- Character: only receives public/visible memories and that character's own memories, never other private handouts.
- Narrator: receives only observable continuity memories such as appearance, location continuity, public events, and visible relationship tone.

Retrieval traces must record candidate ids, selected ids, score components, and visibility reasons.

## Vault Flow

MVP vaults are read-only exported memory bundles:

- A user or dev route can create a vault from a completed or paused session.
- A new session can attach one or more vaults in `read_only` mode.
- Vault content participates in retrieval, but active turns do not mutate the vault.
- Live interlink is deferred until the read-only path is proven safe.

## Manual Editing and Diagnostics

DevPanel should add a small Memory Cortex section:

- retrieval query summary for the latest turn
- selected memory chunks with score breakdown
- known entities and aliases
- relationship rows and evidence chunk ids
- vault links

Manual editing should start server-side:

- list entities and relations
- update canonical name, aliases, relation descriptor, intensity, salience
- delete or suppress one chunk/relation

The main player UI should not expose this until the debugging path is stable.

## Safety and Visibility Boundaries

Memory context must obey the same boundaries as current context builders:

- Director can see broad orchestration memory, but should still use case-runtime allowed fact ids for mystery truth.
- Character cannot receive other characters' private memories, hidden truth vault text, or full relationship graph if it violates existing handout boundaries.
- Narrator cannot receive private motives or inner thoughts as fact.
- User persona aliases must follow the existing introduction/name-known rules.

Every retrieval result should carry a `visibility` reason so tests can assert why it was allowed.

## Implementation Slices

1. Shared types and pure memory scoring tests.
2. SQLite store with schema, FTS, CRUD, and rollback/delete helpers.
3. Turn ingestion on create/advance/reroll/undo.
4. Retrieval service and context injection into Director only.
5. Extend retrieval to Character/Narrator with visibility tests.
6. DevPanel Memory Cortex diagnostics.
7. Read-only vault export and attachment.
8. Manual edit endpoints.

The first shippable milestone is slices 1-4 with tests and no player-facing UI.

## Validation

Minimum checks for the first implementation milestone:

- `corepack pnpm --filter @hushline/server test src/engine-v2/__tests__/memory-cortex.test.ts`
- `corepack pnpm --filter @hushline/server test src/__tests__/api-v2.test.ts`
- `corepack pnpm --filter @hushline/server check`
- `git diff --check`

When DevPanel UI changes begin:

- `corepack pnpm --filter @hushline/client check`
- focused client tests if API DTOs change
- browser smoke on the active local app

## Open Risks

- Existing dirty worktree contains unrelated setup/provider/card-import changes, so implementation must be done as a bounded slice and staged file-by-file.
- Reroll and undo can leave stale memories unless memory rows are tied to message ids and turn checkpoints.
- Mystery scenarios can leak hidden truth if retrieval ignores case-runtime visibility.
- Cross-session vaults can pollute character identity if vault attachment does not preserve scenario/persona/source metadata.

## Approval Gate

B option is selected: separate SQLite-backed Cortex-lite with deterministic extraction first. Implementation should begin only after this design is reviewed and converted into a step-by-step implementation plan.
