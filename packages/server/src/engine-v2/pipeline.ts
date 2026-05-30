// ──────────────────────────────────────────────
// Engine v2 — Turn Pipeline Orchestrator
// ──────────────────────────────────────────────
// Main entry point for processing a user turn.
// Sequence: Input → Director → Narrator → Characters → State Update
// ──────────────────────────────────────────────

import type {
  DirectorOutput,
  BoundaryReport,
  ScenarioPack,
  SessionStateV2,
  TurnMessage,
  TurnResultV2,
  WorldState,
} from "@hushline/shared";

import { classifyInput } from "./input-classifier.js";
import { buildPublicContext, buildPrivateHandout, buildOmniscientContext } from "./context-builder.js";
import { invokeDirector } from "./director.js";
import { invokeNarrator } from "./narrator.js";
import { invokeCharacter } from "./character.js";
import { getCurrentAgenda, selectAutonomousSpeaker } from "./agenda-scheduler.js";
import { applyDirectorOutput, markCharacterSpoke, applySceneBeat } from "./state-manager.js";
import { parseBackgroundTags } from "./background-tags.js";
import {
  selectBeat,
  sanitizeBeat,
  shouldInjectBeat,
  turnHadMeaningfulEvent,
  updateInertia,
} from "./scene-beat-generator.js";
import {
  enforceCharacterBoundary,
  enforceNarratorBoundary,
  mergeBoundaryReports,
} from "./boundary.js";
import { enforceDirectorLaw } from "./director-law.js";
import { buildStateLawSnapshot } from "./state-law.js";
import { routeCaseInquiry } from "./case-inquiry-router.js";
import { resolveCaseAnswerScope, summarizeCaseRuntimeBoundary } from "./case-scope-resolver.js";
import { recordCaseClaims } from "./case-state.js";
import { getAllCaseFacts, getHiddenTruthIds } from "./case-knowledge.js";
import { detectContradictions, markPlayerNoticedContradiction } from "./contradiction-engine.js";
import { parseDeductionAttempt, validateDeductionAttempt } from "./deduction-validator.js";
import { resolveNarratorScope } from "./narrator-scope.js";
import { validateNarratorDraft } from "./narrator-boundary-gate.js";
import { validateCharacterDraft, type BoundaryGateResult } from "./runtime-boundary-gate.js";
import { extractClaimFromApprovedDialogue } from "./claim-ledger.js";
import { propagateKnowledgeFromTurn } from "./knowledge-propagation.js";
import { buildSceneStateSnapshot } from "./scene-state-snapshot.js";
import { recordRevealedCaseFacts, recordEncounteredCharacters } from "./case-state.js";
import { updateAmbiguityZone } from "./ambiguity-zone.js";
import { attachCaseRuntimeToDirectorOutput, buildContradictionPlan } from "./director-pipeline.js";
import { buildNarratorInstruction } from "./narrator-pipeline.js";
import {
  getAllowedBackgroundIds,
  getConnection,
  snapshotGenerationModel,
  type TurnRuntimeOptionsV2,
} from "./runtime-options.js";
import { reconstructPack } from "./session-helpers.js";
import { buildSystemMessageContent, composeSceneMessages } from "./turn-messages.js";
import { hasUserIntroducedName } from "./user-identity.js";

/**
 * Run a complete turn through the v2 pipeline.
 *
 * Flow:
 * 1. Classify input (chat/action/whisper)
 * 2. Build contexts (public/omniscient/private)
 * 3. Invoke Director → JSON decision
 * 4. Invoke Narrator (conditional)
 * 5. Invoke Characters (1-2, parallel if 2)
 * 6. Apply state updates
 * 7. Assemble messages
 */
export async function runTurnV2(
  session: SessionStateV2,
  rawInput: string,
  options: TurnRuntimeOptionsV2 = {},
): Promise<TurnResultV2> {
  const pack = options.scenarioPack ?? reconstructPack(session);
  const connections = options.connections ?? {};


  // ── Step 1: Input Classification ──
  const { mode: inputMode, content: classifiedUserContent } = classifyInput(rawInput, options.inputMode);
  const allowedBackgroundIds = getAllowedBackgroundIds(pack, session.worldState);
  const parsedUserContent = parseBackgroundTags(classifiedUserContent, allowedBackgroundIds);
  const userContent = parsedUserContent.content || classifiedUserContent;
  let taggedBackgroundId = parsedUserContent.backgroundId;
  const userNameIntroduced = hasUserIntroducedName(session.messages, session.persona.name, userContent);

  // ── Step 2: Context Assembly ──
  const publicContext = buildPublicContext(
    session.worldState,
    session.messages,
    pack,
    session.persona.name,
    userNameIntroduced,
  );
  const omniscientContext = buildOmniscientContext(session.worldState, session.characters, pack);
  const caseInquiry = routeCaseInquiry(userContent, pack);
  const caseFacts = getAllCaseFacts(pack.caseKnowledge);
  const hiddenTruthIds = getHiddenTruthIds(pack.caseKnowledge);
  const existingClaims = session.worldState.claimLedger?.claims ?? [];
  const existingContradictions = (session.worldState.claimLedger?.contradictions ?? [])
    .filter(isContradictionRecord);
  const detectedContradictions = detectContradictions({
    claims: existingClaims,
    facts: caseFacts,
    existingContradictions,
    currentTurn: session.worldState.turnNumber + 1,
  });
  const contradictionsWithPlayerNotice = markPlayerNoticedContradiction({
    inquiryFrame: caseInquiry,
    contradictions: detectedContradictions,
    currentTurn: session.worldState.turnNumber + 1,
  });
  const deductionAttempt = parseDeductionAttempt({
    content: userContent,
    inquiryFrame: caseInquiry,
    revealedFactIds: [],
    claims: existingClaims,
    contradictions: contradictionsWithPlayerNotice,
  });
  const deductionResult = deductionAttempt && pack.caseKnowledge?.hiddenTruthVault?.solutionGraph
    ? validateDeductionAttempt({
        attempt: deductionAttempt,
        solutionGraph: pack.caseKnowledge.hiddenTruthVault.solutionGraph,
        revealedFactIds: [],
        claims: existingClaims,
        contradictions: contradictionsWithPlayerNotice,
      })
    : undefined;
  if (deductionAttempt && deductionResult) {
    deductionAttempt.validationResult = deductionResult;
  }
  const caseAnswerScope = pack.caseKnowledge
    ? resolveCaseAnswerScope({
        inquiryFrame: caseInquiry,
        caseKnowledge: pack.caseKnowledge,
        revealedFactIds: [],
        claims: existingClaims,
        currentTurn: session.worldState.turnNumber + 1,
        ...(pack.caseKnowledge.revealBudget ? { revealBudget: pack.caseKnowledge.revealBudget } : {}),
      })
    : resolveCaseAnswerScope(caseInquiry, pack);
  const caseRuntimeInput = {
    inquiry: caseInquiry,
    answerScope: caseAnswerScope,
  };

  // ── Step 3: Director Invocation ──
  const directorConnection = getConnection(connections, "director");
  const directorResult = await invokeDirector(
    session.worldState,
    omniscientContext,
    publicContext,
    userContent,
    inputMode,
    pack,
    directorConnection,
    caseRuntimeInput,
  );
  const directorBoundary = enforceDirectorLaw(directorResult.output, session.worldState, pack);
  let directorOutput = attachCaseRuntimeToDirectorOutput(
    directorBoundary.output,
    caseInquiry,
    caseAnswerScope,
  );
  directorOutput = {
    ...directorOutput,
    contradictionPlan: buildContradictionPlan(contradictionsWithPlayerNotice),
    ...(deductionAttempt
      ? {
          deductionPlan: {
            attemptId: deductionAttempt.id,
            verdict: deductionResult?.verdict ?? "insufficient",
            safeFeedbackFactIds: deductionAttempt.factRefs,
            missingProofNodeIds: Object.entries(deductionResult?.requiredElementCoverage ?? {})
              .filter(([, covered]) => !covered)
              .map(([id]) => id),
            unlockTruthIds: deductionResult?.verdict === "correct" ? hiddenTruthIds : [],
          },
        }
      : {}),
  };

  // ── Step 4: Narrator Invocation (conditional) ──
  const narratorConnection = getConnection(connections, "narrator");
  const narratorScope = resolveNarratorScope({
    inquiryFrame: caseInquiry,
    caseScope: caseAnswerScope,
    revealedFactIds: [],
    currentLocationId: session.worldState.locationId,
    ...(pack.caseKnowledge ? { caseKnowledge: pack.caseKnowledge } : {}),
  });
  directorOutput = { ...directorOutput, narratorScope };
  const narratorInstruction = buildNarratorInstruction(
    directorOutput,
    inputMode,
    publicContext,
    pack,
  );
  const narratorResult = await invokeNarrator(
    narratorInstruction,
    inputMode,
    publicContext,
    userContent,
    pack,
    narratorConnection,
  );
  const narratorBoundary = enforceNarratorBoundary(narratorResult.content);
  const narratorGate = narratorBoundary.content
    ? validateNarratorDraft({
        draft: narratorBoundary.content,
        scope: narratorScope,
        hiddenTruthIds,
        caseFacts,
      })
    : { status: "approved" as const, violations: [] };
  const narratorContent = narratorGate.status === "approved"
    ? narratorBoundary.content
    : narratorGate.finalText ?? narratorBoundary.content;

  // ── Step 5: Character Invocations ──
  const characterMessages: TurnMessage[] = [];
  const characterBoundaryReports: BoundaryReport[] = [];
  const characterGateResults: Array<{ npcId: string; gate: BoundaryGateResult }> = [];

  // Shared per-result processing for both Director-selected and autonomous speakers.
  // Applies boundary gate, character runtime gate, answerScope fact filtering, and
  // background-tag parsing, then appends a character message.
  const processCharacterResult = (
    result: { characterId: string; content: string; source: "api" | "dry-run"; error?: string },
    connection: ReturnType<typeof getConnection>,
  ): void => {
    const activeCharacter = session.characters.find((c) => c.id === result.characterId);
    const characterBoundary = enforceCharacterBoundary(result.content, result.characterId, pack, undefined, caseAnswerScope);
    characterBoundaryReports.push(characterBoundary.report);
    const witness = caseAnswerScope.allowedWitnesses.find((candidate) => candidate.characterId === result.characterId);
    const characterGate = validateCharacterDraft({
      draft: characterBoundary.content || result.content,
      npcId: result.characterId,
      userInput: userContent,
      userPersonaName: session.persona.name,
      userNameIntroduced,
      allowedFactIds: [
        ...caseAnswerScope.publicFactIds,
        ...caseAnswerScope.observableFactIds,
        ...(witness?.factIds ?? []),
      ],
      blockedFactIds: caseAnswerScope.blockedFactIds,
      hiddenTruthIds,
      knownClaimIds: existingClaims.map((claim) => claim.id),
      caseFacts,
      currentTurn: session.worldState.turnNumber + 1,
      privateLeakTexts: activeCharacter
        ? [
            activeCharacter.handout.secret,
            activeCharacter.handout.desire,
            activeCharacter.handout.objective,
            activeCharacter.handout.fear ?? "",
            ...(activeCharacter.handout.behaviorRules ?? []),
          ]
        : [],
    });
    characterGateResults.push({ npcId: result.characterId, gate: characterGate });
    const characterContent = characterGate.finalText || characterBoundary.content || result.content;
    const parsedContent = parseBackgroundTags(characterContent, allowedBackgroundIds);
    if (parsedContent.backgroundId) {
      taggedBackgroundId = parsedContent.backgroundId;
    }
    const generationModel = result.source === "api" ? snapshotGenerationModel(connection) : undefined;
    characterMessages.push({
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "character",
      content: parsedContent.content || characterContent,
      characterId: result.characterId,
      speakerLabel: session.characters.find((c) => c.id === result.characterId)?.anonymousLabel
        ?? session.characters.find((c) => c.id === result.characterId)?.name
        ?? result.characterId,
      generationSource: result.source === "api" ? "api" : "dry-run",
      ...(generationModel ? { generationModel } : {}),
      ...(result.error ? { fallbackReason: result.error } : {}),
      createdAt: new Date().toISOString(),
    });
  };

  if (!directorOutput.silence && directorOutput.speakers.length > 0) {
    // Invoke characters — parallel if 2 speakers
    const characterResults = await Promise.all(
      directorOutput.speakers.map((speakerId) => {
        const character = session.characters.find((c) => c.id === speakerId);
        if (!character) return null;

        const handout = buildPrivateHandout(speakerId, session.worldState, session.characters);
        const intent = directorOutput.characterIntents[speakerId] ?? "상황에 맞게 자연스럽게 반응한다.";
        const charConnection = getConnection(connections, speakerId);

        return invokeCharacter(
          character,
          handout,
          intent,
          inputMode,
          userContent,
          publicContext,
          session.messages,
          session.persona.name,
          pack,
          charConnection,
          caseAnswerScope,
        ).then((result) => ({ result, connection: charConnection }));
      }),
    );

    for (const characterResult of characterResults) {
      if (!characterResult) continue;
      processCharacterResult(characterResult.result, characterResult.connection);
    }
  }

  // ── Step 5.5: Autonomous Speaker Fallback ──
  // When the Director picked nobody (and did not request silence), let a high-autonomy
  // NPC that has been quiet act on its own agenda. Reuses the exact same boundary path.
  if (!directorOutput.silence && directorOutput.speakers.length === 0 && characterMessages.length === 0) {
    const currentTurn = session.worldState.turnNumber + 1;
    const autoSpeakerId = selectAutonomousSpeaker(session.characters, session.worldState, currentTurn);
    const autoCharacter = autoSpeakerId
      ? session.characters.find((c) => c.id === autoSpeakerId)
      : undefined;
    const autoState = autoSpeakerId ? session.worldState.characterStates[autoSpeakerId] : undefined;
    if (autoCharacter && autoState) {
      const handout = buildPrivateHandout(autoCharacter.id, session.worldState, session.characters);
      const agenda = getCurrentAgenda(autoCharacter, autoState, currentTurn);
      const intent = `누가 시키지 않았지만 자기 안건에 따라 먼저 말을 꺼낸다: ${agenda.nextAction}. `
        + "현재 장소·시간·관계·감정에 맞게 짧게 반응하고, 자기 비밀과 이해관계를 지킨다.";
      const charConnection = getConnection(connections, autoCharacter.id);
      const result = await invokeCharacter(
        autoCharacter,
        handout,
        intent,
        inputMode,
        userContent,
        publicContext,
        session.messages,
        session.persona.name,
        pack,
        charConnection,
        caseAnswerScope,
      );
      processCharacterResult(result, charConnection);
    }
  }

  // ── Step 6: State Update ──
  const speakerIds = characterMessages.map((m) => m.characterId!).filter(Boolean);
  let nextWorldState = applyDirectorOutput(session.worldState, directorOutput, speakerIds);

  // Mark characters as having spoken
  for (const speakerId of speakerIds) {
    nextWorldState = markCharacterSpoke(nextWorldState, speakerId);
  }
  if (taggedBackgroundId) {
    nextWorldState = {
      ...nextWorldState,
      backgroundId: taggedBackgroundId,
    };
  }
  nextWorldState = recordCaseClaims(nextWorldState, characterMessages, caseInquiry, userContent);
  const extractedClaims = characterMessages
    .map((message) => extractClaimFromApprovedDialogue({
      text: message.content,
      speakerId: message.characterId ?? "unknown",
      turnNumber: session.worldState.turnNumber + 1,
      caseFacts,
      objects: pack.caseKnowledge?.objects ?? [],
      locations: pack.caseKnowledge?.locations ?? [],
    }))
    .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim));
  if (extractedClaims.length > 0) {
    const currentLedger = nextWorldState.claimLedger ?? { claims: [], contradictions: [] };
    const mergedClaims = [...currentLedger.claims];
    for (const claim of extractedClaims) {
      const duplicate = mergedClaims.some((existing) =>
        (existing.speakerId ?? existing.speaker) === claim.speakerId
        && existing.content === claim.content
        && (existing.turnNumber ?? existing.turn) === claim.turnNumber,
      );
      if (!duplicate) {
        mergedClaims.push(claim);
      }
    }
    nextWorldState = {
      ...nextWorldState,
      claimLedger: {
        ...currentLedger,
        claims: mergedClaims,
      },
    };
  }

  const nextClaims = nextWorldState.claimLedger?.claims ?? [];
  const nextContradictions = detectContradictions({
    claims: nextClaims,
    facts: caseFacts,
    existingContradictions: contradictionsWithPlayerNotice,
    currentTurn: session.worldState.turnNumber + 1,
  });
  const propagation = propagateKnowledgeFromTurn({
    userInput: userContent,
    approvedMessages: characterMessages.map((message) => ({
      speakerId: message.characterId ?? "unknown",
      text: message.content,
    })),
    currentLocationId: nextWorldState.locationId,
    presentNpcIds: getPresentNpcIds(pack, speakerIds),
    claims: nextClaims,
    facts: caseFacts,
    currentTurn: session.worldState.turnNumber + 1,
  });
  const updatedAmbiguity = updateAmbiguityZone({
    ambiguousFacts: nextWorldState.ambiguousFacts ?? pack.caseKnowledge?.ambiguousFacts ?? [],
    newClaims: extractedClaims,
    contradictions: nextContradictions,
    ...(deductionResult ? { deductionResult } : {}),
    currentTurn: session.worldState.turnNumber + 1,
  });
  const nextDeductionAttempts = deductionAttempt
    ? [...(nextWorldState.playerDeductionAttempts ?? []), deductionAttempt]
    : nextWorldState.playerDeductionAttempts ?? [];
  const nextSnapshot = buildSceneStateSnapshot({
    sessionId: session.id,
    turnNumber: session.worldState.turnNumber + 1,
    locationId: nextWorldState.locationId,
    sceneMode: nextWorldState.sceneMode,
    revealedFactIds: caseAnswerScope.publicFactIds,
    revealedClueIds: [],
    claims: nextClaims,
    propagatedClaims: [
      ...(nextWorldState.propagatedClaims ?? []),
      ...propagation.propagatedClaims,
    ],
    contradictions: nextContradictions,
    ambiguousFacts: updatedAmbiguity,
    npcKnowledgeDigest: buildNpcKnowledgeDigest(pack, nextClaims, propagation.propagatedClaims, caseAnswerScope.publicFactIds),
    npcTrustLevels: buildNpcTrustLevels(pack, nextWorldState),
    playerHypotheses: nextWorldState.playerHypotheses ?? [],
    playerDeductionAttempts: nextDeductionAttempts,
    revealBudget: pack.caseKnowledge?.revealBudget ?? {},
  });
  nextWorldState = {
    ...nextWorldState,
    claimLedger: {
      claims: nextClaims,
      contradictions: nextContradictions,
    },
    propagatedClaims: [
      ...(nextWorldState.propagatedClaims ?? []),
      ...propagation.propagatedClaims,
    ],
    ambiguousFacts: updatedAmbiguity,
    playerDeductionAttempts: nextDeductionAttempts,
    sceneSnapshots: [
      ...(nextWorldState.sceneSnapshots ?? []),
      nextSnapshot,
    ].slice(-10),
    revealedCaseFacts: recordRevealedCaseFacts(
      nextWorldState.revealedCaseFacts,
      [...caseAnswerScope.publicFactIds, ...caseAnswerScope.observableFactIds],
      new Set(hiddenTruthIds),
      session.worldState.turnNumber + 1,
    ),
    encounteredCharacters: recordEncounteredCharacters(
      nextWorldState.encounteredCharacters,
      speakerIds,
      session.worldState.turnNumber + 1,
    ),
  };
  directorOutput = {
    ...directorOutput,
    devTrace: {
      inquiryType: caseInquiry.inquiryType,
      contradictionIds: nextContradictions.map((contradiction) => contradiction.id),
      ...(deductionResult ? { deductionVerdict: deductionResult.verdict } : {}),
      ambiguityUpdates: updatedAmbiguity.map((fact) => `${fact.id}:${fact.playerVisibleStatus}`),
      blockedTruthIds: caseAnswerScope.blockedTruthIds,
      selectedSpeakerReason: directorOutput.caseDebug?.selectedSpeakerReason ?? "director/default speaker selection",
    },
  };

  // ── Step 6.5: Scene Beat Injection (anti-stall pacing) ──
  let sceneBeatMessage: TurnMessage | null = null;
  {
    const hadCharacterSpeech = characterMessages.length > 0;
    const hadDirectorEvent = Boolean(directorOutput.event);
    const hadStateChange = (directorOutput.stateDelta.tension ?? 0) !== 0
      || (directorOutput.stateDelta.danger ?? 0) !== 0;
    const meaningful = turnHadMeaningfulEvent({ hadCharacterSpeech, hadDirectorEvent, hadStateChange });
    const prevInertia = nextWorldState.sceneInertiaCounter ?? 0;
    const nextInertia = updateInertia(prevInertia, meaningful);
    const sceneDevices = pack.sceneDevices ?? [];
    const inertiaThreshold = (pack.manifest as { sceneBeat?: { inertiaThreshold?: number } }).sceneBeat?.inertiaThreshold;

    if (sceneDevices.length > 0 && shouldInjectBeat(nextInertia, inertiaThreshold)) {
      const recentBeatTypes = nextWorldState.recentBeatTypes ?? [];
      const rawBeat = selectBeat(sceneDevices, nextWorldState, recentBeatTypes);
      if (rawBeat) {
        const beat = sanitizeBeat(rawBeat, hiddenTruthIds);
        // Runtime defense: filter the beat text through the narrator gate.
        const beatGate = validateNarratorDraft({
          draft: beat.description,
          scope: narratorScope,
          hiddenTruthIds,
          caseFacts,
        });
        const safeBeatText = beatGate.status === "approved"
          ? beat.description
          : beatGate.finalText ?? beat.description;
        nextWorldState = applySceneBeat(nextWorldState, { ...beat, description: safeBeatText });
        sceneBeatMessage = {
          id: crypto.randomUUID(),
          sessionId: session.id,
          role: "narrator",
          content: safeBeatText,
          speakerLabel: "[장면]",
          generationSource: "dry-run",
          createdAt: new Date().toISOString(),
        };
      } else {
        nextWorldState = { ...nextWorldState, sceneInertiaCounter: nextInertia };
      }
    } else {
      nextWorldState = { ...nextWorldState, sceneInertiaCounter: nextInertia };
    }
  }

  // ── Step 7: Message Assembly ──
  const turnMessages: TurnMessage[] = [];

  // User message
  turnMessages.push({
    id: crypto.randomUUID(),
    sessionId: session.id,
    role: "user",
    content: userContent,
    inputMode,
    createdAt: new Date().toISOString(),
  });

  // Narrator message (if any)
  let narratorMessage: TurnMessage | null = null;
  if (narratorContent) {
    const parsedContent = parseBackgroundTags(narratorContent, allowedBackgroundIds);
    if (parsedContent.backgroundId) {
      nextWorldState = {
        ...nextWorldState,
        backgroundId: parsedContent.backgroundId,
      };
    }
    const generationModel = narratorResult.source === "api" ? snapshotGenerationModel(narratorConnection) : undefined;
    narratorMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "narrator",
      content: parsedContent.content || narratorContent,
      speakerLabel: "[나레이터]",
      generationSource: narratorResult.source === "api" ? "api" : "dry-run",
      ...(generationModel ? { generationModel } : {}),
      ...(narratorResult.error ? { fallbackReason: narratorResult.error } : {}),
      createdAt: new Date().toISOString(),
    };
  }

  const systemContent = buildSystemMessageContent(directorOutput);
  let systemMessage: TurnMessage | null = null;
  if (systemContent) {
    systemMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: "system",
      content: systemContent,
      speakerLabel: "[시스템]",
      createdAt: new Date().toISOString(),
    };
  }

  turnMessages.push(...composeSceneMessages(directorOutput, narratorMessage, characterMessages, systemMessage));

  if (sceneBeatMessage) {
    turnMessages.push(sceneBeatMessage);
  }

  const stateLaw = buildStateLawSnapshot(nextWorldState, pack);

  return {
    worldState: nextWorldState,
    messages: turnMessages,
    directorOutput,
    boundaryReport: mergeBoundaryReports(
      directorBoundary.report,
      narratorBoundary.report,
      makeNarratorGateReport(narratorGate),
      ...characterGateResults.map(({ npcId, gate }) => makeCharacterGateReport(npcId, gate)),
      ...characterBoundaryReports,
    ),
    stateLaw,
    ...(caseInquiry.isCaseInquiry
      ? {
          caseRuntime: {
            inquiry: caseInquiry,
            answerScope: caseAnswerScope,
            boundarySummary: summarizeCaseRuntimeBoundary(caseAnswerScope),
            devTrace: {
              inquiryType: caseInquiry.inquiryType,
              truthLeakRisk: caseInquiry.truthLeakRisk,
              allowedFacts: [
                ...caseAnswerScope.publicFactIds,
                ...caseAnswerScope.observableFactIds,
                ...caseAnswerScope.allowedWitnesses.flatMap((witness) => witness.factIds),
              ],
              blockedFacts: caseAnswerScope.blockedFactIds,
              contradictionIds: nextContradictions.map((contradiction) => contradiction.id),
              ...(deductionResult ? { deductionVerdict: deductionResult.verdict } : {}),
              ...(pack.caseKnowledge?.revealBudget ? { revealBudget: pack.caseKnowledge.revealBudget } : {}),
              characterGate: characterGateResults.map(({ npcId, gate }) => ({
                npcId,
                status: gate.status,
                violations: gate.violations,
              })),
              narratorGate: {
                status: narratorGate.status,
                violations: narratorGate.violations,
              },
              ...(extractedClaims[0]?.id ? { claimRegistered: extractedClaims[0].id } : {}),
              snapshotId: nextSnapshot.id,
            },
          },
        }
      : {}),
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function isContradictionRecord(value: unknown): value is import("@hushline/shared").ContradictionRecord {
  return Boolean(
    value
    && typeof value === "object"
    && "id" in value
    && "claimAId" in value
    && "conflictType" in value,
  );
}

function getPresentNpcIds(pack: ScenarioPack, speakerIds: string[]): string[] {
  const ids = speakerIds.length > 0 ? speakerIds : pack.characters.map((character) => character.id);
  return [...new Set(ids)];
}

function buildNpcKnowledgeDigest(
  pack: ScenarioPack,
  claims: import("@hushline/shared").Claim[],
  propagatedClaims: import("@hushline/shared").PropagatedClaim[],
  revealedFactIds: string[],
): import("@hushline/shared").SceneStateSnapshot["npcKnowledgeDigest"] {
  return Object.fromEntries(pack.characters.map((character) => {
    const knownClaimIds = claims
      .filter((claim) => (claim.speakerId ?? claim.speaker) === character.id)
      .map((claim) => claim.id);
    const propagatedKnownClaimIds = propagatedClaims
      .filter((claim) => claim.toActorId === character.id)
      .map((claim) => claim.id);
    return [
      character.id,
      {
        knownFactIds: [...revealedFactIds],
        knownClaimIds: [...knownClaimIds, ...propagatedKnownClaimIds],
        suspectedFactIds: [],
        falseBeliefIds: [],
      },
    ];
  }));
}

function buildNpcTrustLevels(pack: ScenarioPack, worldState: WorldState): Record<string, number> {
  return Object.fromEntries(pack.characters.map((character) => [
    character.id,
    worldState.characterStates[character.id]?.relationshipToUser ?? character.handout.initialRelationshipToUser,
  ]));
}

function makeNarratorGateReport(gate: { status: string; violations: string[] }): BoundaryReport {
  return {
    corrected: gate.violations.length > 0,
    violations: gate.violations.map((violation) => ({
      layer: "narrator",
      code: `runtime-${violation}`,
      message: `Narrator runtime gate: ${violation}`,
      action: gate.status === "approved" ? "removed" : "replaced",
      path: "content",
    })),
  };
}

function makeCharacterGateReport(npcId: string, gate: BoundaryGateResult): BoundaryReport {
  return {
    corrected: gate.violations.length > 0,
    violations: gate.violations.map((violation) => ({
      layer: "character",
      code: `runtime-${violation}`,
      message: `Character runtime gate: ${violation}`,
      action: gate.status === "approved" ? "removed" : "replaced",
      path: "content",
      characterId: npcId,
    })),
  };
}
