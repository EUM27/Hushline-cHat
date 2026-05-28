// ──────────────────────────────────────────────
// Engine v2 — Turn Pipeline Orchestrator
// ──────────────────────────────────────────────
// Main entry point for processing a user turn.
// Sequence: Input → Director → Narrator → Characters → State Update
// ──────────────────────────────────────────────

import type {
  DirectorOutput,
  BoundaryReport,
  GenerationModelSnapshot,
  InputMode,
  ModelConnection,
  PublicContext,
  ScenarioPack,
  SessionStateV2,
  TurnMessage,
  TurnOptionsV2,
  TurnResultV2,
  WorldState,
} from "@hushline/shared";

type TurnRuntimeOptionsV2 = TurnOptionsV2 & {
  scenarioPack?: ScenarioPack;
};

import { classifyInput } from "./input-classifier.js";
import { buildPublicContext, buildPrivateHandout, buildOmniscientContext } from "./context-builder.js";
import { invokeDirector } from "./director.js";
import { invokeNarrator } from "./narrator.js";
import { invokeCharacter } from "./character.js";
import { applyDirectorOutput, markCharacterSpoke } from "./state-manager.js";
import { parseBackgroundTags } from "./background-tags.js";
import {
  enforceCharacterBoundary,
  enforceNarratorBoundary,
  mergeBoundaryReports,
} from "./boundary.js";
import { enforceDirectorLaw } from "./director-law.js";
import { buildStateLawSnapshot } from "./state-law.js";
import { routeCaseInquiry } from "./case-inquiry-router.js";
import { buildRevealPermissions, resolveCaseAnswerScope, summarizeCaseRuntimeBoundary } from "./case-scope-resolver.js";
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
import { updateAmbiguityZone } from "./ambiguity-zone.js";

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

  // ── Step 2: Context Assembly ──
  const publicContext = buildPublicContext(session.worldState, session.messages, pack);
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
    contradictionPlan: {
      contradictionIds: contradictionsWithPlayerNotice.map((contradiction) => contradiction.id),
      pressureByNpc: buildPressureByNpc(contradictionsWithPlayerNotice),
      allowedReactionByNpc: buildAllowedReactionByNpc(contradictionsWithPlayerNotice),
    },
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
  const characterBoundaryReports = [];
  const characterGateResults: Array<{ npcId: string; gate: BoundaryGateResult }> = [];

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
      const { result, connection } = characterResult;
      const characterBoundary = enforceCharacterBoundary(result.content, result.characterId, pack, undefined, caseAnswerScope);
      characterBoundaryReports.push(characterBoundary.report);
      const witness = caseAnswerScope.allowedWitnesses.find((candidate) => candidate.characterId === result.characterId);
      const characterGate = validateCharacterDraft({
        draft: characterBoundary.content || result.content,
        npcId: result.characterId,
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

function attachCaseRuntimeToDirectorOutput(
  directorOutput: DirectorOutput,
  inquiry: ReturnType<typeof routeCaseInquiry>,
  answerScope: ReturnType<typeof resolveCaseAnswerScope>,
): DirectorOutput {
  if (!inquiry.isCaseInquiry) {
    return directorOutput;
  }
  const revealPermissions = buildRevealPermissions(answerScope);
  return {
    ...directorOutput,
    inquiry: directorOutput.inquiry ?? inquiry,
    answerScope: directorOutput.answerScope ?? answerScope,
    revealPermissions: {
      ...revealPermissions,
      ...(directorOutput.revealPermissions ?? {}),
    },
    caseDebug: directorOutput.caseDebug ?? {
      selectedSpeakerReason: answerScope.recommendedSpeakerIds.length
        ? "case scope recommended speaker from testimony/target resolution"
        : "director/default speaker selection",
      blockedReasonSummary: answerScope.blockedTruthIds.map((truthId) => `${truthId}: hidden truth locked`),
      truthLeakRisk: inquiry.truthLeakRisk,
    },
  };
}

function composeSceneMessages(
  directorOutput: DirectorOutput,
  narratorMessage: TurnMessage | null,
  characterMessages: TurnMessage[],
  systemMessage: TurnMessage | null,
): TurnMessage[] {
  const plan = directorOutput.messagePlan;
  if (!plan || plan.length === 0) {
    return [
      ...(narratorMessage ? [narratorMessage] : []),
      ...characterMessages,
      ...(systemMessage ? [systemMessage] : []),
    ];
  }

  const result: TurnMessage[] = [];
  const remainingCharacters = new Map(characterMessages.map((message) => [message.characterId, message]));
  let narratorUsed = false;
  let systemUsed = false;

  for (const item of plan) {
    if (item.kind === "narrator" && narratorMessage && !narratorUsed) {
      result.push(narratorMessage);
      narratorUsed = true;
      continue;
    }
    if (item.kind === "system" && systemMessage && !systemUsed) {
      result.push(systemMessage);
      systemUsed = true;
      continue;
    }
    if (item.kind === "character" && item.speakerId) {
      const message = remainingCharacters.get(item.speakerId);
      if (message) {
        result.push(message);
        remainingCharacters.delete(item.speakerId);
      }
    }
  }

  if (result.length === 0) {
    return [
      ...(narratorMessage ? [narratorMessage] : []),
      ...characterMessages,
      ...(systemMessage ? [systemMessage] : []),
    ];
  }

  return result;
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

function buildPressureByNpc(
  contradictions: import("@hushline/shared").ContradictionRecord[],
): Record<string, 0 | 1 | 2 | 3> {
  const pressureByNpc: Record<string, 0 | 1 | 2 | 3> = {};
  for (const contradiction of contradictions) {
    for (const npcId of contradiction.involvedNpcIds) {
      const reaction = contradiction.npcReaction[npcId];
      const pressure = reaction?.pressureLevel ?? (contradiction.playerNoticed ? 1 : 0);
      pressureByNpc[npcId] = Math.max(pressureByNpc[npcId] ?? 0, pressure) as 0 | 1 | 2 | 3;
    }
  }
  return pressureByNpc;
}

function buildAllowedReactionByNpc(
  contradictions: import("@hushline/shared").ContradictionRecord[],
): Record<string, "deflect" | "doubled_down" | "cracked" | "explained_away" | "silence"> {
  const reactions: Record<string, "deflect" | "doubled_down" | "cracked" | "explained_away" | "silence"> = {};
  for (const contradiction of contradictions) {
    for (const npcId of contradiction.involvedNpcIds) {
      const pressure = contradiction.npcReaction[npcId]?.pressureLevel ?? (contradiction.playerNoticed ? 1 : 0);
      reactions[npcId] = pressure >= 3 ? "cracked" : pressure >= 2 ? "doubled_down" : "deflect";
    }
  }
  return reactions;
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

function getConnection(
  connections: Record<string, ModelConnection>,
  slot: string,
): ModelConnection | undefined {
  return connections[slot] ?? connections.default;
}

function snapshotGenerationModel(connection: ModelConnection | undefined): GenerationModelSnapshot | undefined {
  if (!connection?.model) {
    return undefined;
  }

  return {
    providerId: connection.providerId,
    model: connection.model,
  };
}

function getAllowedBackgroundIds(pack: ScenarioPack, worldState: WorldState): string[] {
  const ids = pack.scenarioCard.backgroundIds.length > 0
    ? pack.scenarioCard.backgroundIds
    : [worldState.backgroundId];
  return [...new Set(ids.filter(Boolean))];
}

function buildNarratorInstruction(
  directorOutput: DirectorOutput,
  inputMode: InputMode,
  publicContext: PublicContext,
  pack: ScenarioPack,
): string | null {
  if (directorOutput.narratorInstruction) {
    return directorOutput.narratorInstruction;
  }

  if (directorOutput.event) {
    return `다음 장면 사건을 캐릭터 대사 없이 감각적 장면 서술 1~2문장으로 보여준다: ${directorOutput.event}`;
  }

  if (inputMode === "action") {
    return null;
  }

  if (!shouldCreateSceneNarration(publicContext, pack)) {
    return null;
  }

  return [
    "현재 장면에서 유저 입력 직후의 공간, 분위기, 인물들의 비언어적 반응을 1~2문장으로 묘사한다.",
    "캐릭터 대사는 쓰지 말고, 새 단서나 외부 사건을 만들지 말며, 현재 위치와 직전 입력에 붙인다.",
  ].join(" ");
}

function shouldCreateSceneNarration(publicContext: PublicContext, pack: ScenarioPack): boolean {
  if (pack.manifest.uiMode === "scene-first") {
    return true;
  }

  if (pack.manifest.uiMode === "messenger-first" && publicContext.sceneMode === "messenger") {
    return false;
  }

  return publicContext.sceneMode !== "messenger";
}

function buildSystemMessageContent(directorOutput: DirectorOutput): string | null {
  const lines: string[] = [];

  const stateChanges = formatStateDelta(directorOutput.stateDelta);
  if (stateChanges.length > 0) {
    lines.push(`상태 변화: ${stateChanges.join(", ")}`);
  }

  if (directorOutput.subObjectiveUpdate) {
    const objective = directorOutput.subObjectiveUpdate.description ?? directorOutput.subObjectiveUpdate.id ?? "목표";
    lines.push(`목표 ${directorOutput.subObjectiveUpdate.action}: ${objective}`);
  }

  if (directorOutput.relationshipUpdate) {
    lines.push(
      `관계 변화: ${directorOutput.relationshipUpdate.sourceId} → ${directorOutput.relationshipUpdate.targetId} `
      + `${directorOutput.relationshipUpdate.descriptor} (${directorOutput.relationshipUpdate.intensityDelta >= 0 ? "+" : ""}${directorOutput.relationshipUpdate.intensityDelta})`,
    );
  }

  if (directorOutput.directives.length > 0) {
    lines.push(`연출: ${directorOutput.directives.map((directive) => directive.effect).join(", ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

function formatStateDelta(delta: DirectorOutput["stateDelta"]): string[] {
  const changes: string[] = [];
  if (typeof delta.tension === "number" && delta.tension !== 0) {
    changes.push(`긴장 ${delta.tension > 0 ? "+" : ""}${delta.tension}`);
  }
  if (typeof delta.danger === "number" && delta.danger !== 0) {
    changes.push(`위험 ${delta.danger > 0 ? "+" : ""}${delta.danger}`);
  }
  if (delta.locationId) {
    changes.push(`위치 ${delta.locationId}`);
  }
  if (delta.backgroundId) {
    changes.push(`배경 ${delta.backgroundId}`);
  }
  if (delta.sceneMode) {
    changes.push(`모드 ${delta.sceneMode}`);
  }
  return changes;
}

/**
 * Reconstruct a minimal ScenarioPack from session data.
 * In production this would load from disk; here we reconstruct from persisted session.
 */
function reconstructPack(session: SessionStateV2): ScenarioPack {
  // The session stores characters and worldState but not the full pack prompts.
  // For now, return a minimal pack. The full implementation will cache loaded packs.
  return {
    manifest: {
      id: session.scenarioPackId,
      title: session.title,
      subtitle: "",
      genre: "horror", // TODO: persist genre in session
      version: "1.0.0",
      engineVersion: ">=2.0.0",
    },
    scenarioCard: {
      id: session.scenarioPackId,
      title: session.title,
      subtitle: "",
      description: "",
      spaceRules: [],
      chatRules: [],
      toneRules: [],
      hardNos: [],
      backgroundIds: [],
      initialLocationId: session.worldState.locationId,
      initialBackgroundId: session.worldState.backgroundId,
      initialSceneMode: "messenger",
      interventionPrompt: "",
      openingBeats: [],
    },
    characters: session.characters,
    directorPrompt: "", // Will be loaded from pack cache
    narratorPrompt: "",
    mainObjective: {
      id: session.worldState.mainObjective.id,
      description: session.worldState.mainObjective.description,
    },
    eventTriggers: [],
  };
}
