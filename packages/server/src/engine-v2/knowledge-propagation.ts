import type {
  CaseFact,
  Claim,
  KnowledgePropagationEvent,
  LocationId,
  NpcId,
  PropagatedClaim,
} from "@hushline/shared";

export function propagateKnowledgeFromTurn(input: {
  userInput: string;
  approvedMessages: Array<{
    speakerId: string;
    text: string;
  }>;
  currentLocationId: LocationId;
  presentNpcIds: NpcId[];
  claims: Claim[];
  facts: CaseFact[];
  currentTurn: number;
}): {
  events: KnowledgePropagationEvent[];
  propagatedClaims: PropagatedClaim[];
} {
  const events: KnowledgePropagationEvent[] = [];
  const propagatedClaims: PropagatedClaim[] = [];

  for (const npcId of input.presentNpcIds) {
    if (input.userInput.trim()) {
      const id = `prop_${input.currentTurn}_user_${npcId}_${propagatedClaims.length + 1}`;
      events.push({
        id: `event_${id}`,
        fromActorId: "user",
        toActorId: npcId,
        turnNumber: input.currentTurn,
        propagationType: "told_directly",
        reliability: 0.6,
        distortion: "compressed",
        propagatedContent: input.userInput,
        resultingKnowledge: "known_claim",
        visibilityCondition: { sameLocation: true, sameChatChannel: true },
      });
      propagatedClaims.push({
        id,
        fromActorId: "user",
        toActorId: npcId,
        turnNumber: input.currentTurn,
        content: input.userInput,
        reliability: 0.6,
        distortion: "compressed",
      });
    }

    for (const message of input.approvedMessages) {
      if (message.speakerId === npcId) {
        continue;
      }
      const id = `prop_${input.currentTurn}_${message.speakerId}_${npcId}_${propagatedClaims.length + 1}`;
      events.push({
        id: `event_${id}`,
        fromActorId: message.speakerId,
        toActorId: npcId,
        turnNumber: input.currentTurn,
        propagationType: "overheard",
        reliability: 0.4,
        distortion: "compressed",
        propagatedContent: message.text,
        resultingKnowledge: "known_claim",
        visibilityCondition: { sameLocation: true, audibleRange: true },
      });
      propagatedClaims.push({
        id,
        fromActorId: message.speakerId,
        toActorId: npcId,
        turnNumber: input.currentTurn,
        content: message.text,
        reliability: 0.4,
        distortion: "compressed",
      });
    }
  }

  return { events, propagatedClaims };
}
