import type { CaseFact, CaseInquiryFrame, Claim, ContradictionRecord } from "@hushline/shared";

export function detectContradictions(input: {
  claims: Claim[];
  facts: CaseFact[];
  existingContradictions: ContradictionRecord[];
  currentTurn: number;
}): ContradictionRecord[] {
  const records = [...input.existingContradictions];
  for (let i = 0; i < input.claims.length; i += 1) {
    for (let j = i + 1; j < input.claims.length; j += 1) {
      const left = input.claims[i]!;
      const right = input.claims[j]!;
      if (hasExisting(records, left.id, right.id)) {
        continue;
      }
      const conflictType = classifyConflict(left, right);
      if (!conflictType) {
        continue;
      }
      const involvedNpcIds = [...new Set([speakerOf(left), speakerOf(right)].filter(Boolean))];
      records.push({
        id: `contra_${conflictType}_${left.id}_${right.id}`,
        claimAId: left.id,
        claimBId: right.id,
        conflictType,
        severity: conflictType === "object_conflict" ? 2 : 1,
        detectedAtTurn: input.currentTurn,
        detectedBy: "engine",
        playerNoticed: false,
        playerPresentedEvidenceIds: [],
        playerPresentedClaimIds: [],
        involvedNpcIds,
        status: "candidate",
        npcReaction: Object.fromEntries(involvedNpcIds.map((npcId) => [
          npcId,
          { pressureLevel: 0, reaction: "not_yet_confronted" },
        ])),
      });
    }
  }
  return records;
}

export function markPlayerNoticedContradiction(input: {
  inquiryFrame: CaseInquiryFrame;
  contradictions: ContradictionRecord[];
  currentTurn: number;
}): ContradictionRecord[] {
  if (input.inquiryFrame.inquiryType !== "contradiction_challenge") {
    return input.contradictions;
  }
  const referenced = new Set(input.inquiryFrame.referencedClaimIds);
  return input.contradictions.map((contradiction) => {
    const directlyReferenced = referenced.has(contradiction.claimAId) || Boolean(contradiction.claimBId && referenced.has(contradiction.claimBId));
    const shouldNotice = directlyReferenced || input.inquiryFrame.topicTags.length > 0;
    if (!shouldNotice) {
      return contradiction;
    }
    const pressure = computeContradictionPressure({ contradiction, inquiryFrame: input.inquiryFrame });
    return {
      ...contradiction,
      playerNoticed: true,
      detectedBy: "player",
      status: contradiction.status === "candidate" ? "confirmed" : contradiction.status,
      playerPresentedClaimIds: [...new Set([...contradiction.playerPresentedClaimIds, ...input.inquiryFrame.referencedClaimIds])],
      playerPresentedEvidenceIds: [...new Set([...contradiction.playerPresentedEvidenceIds, ...input.inquiryFrame.referencedEvidenceIds])],
      npcReaction: Object.fromEntries(contradiction.involvedNpcIds.map((npcId) => [
        npcId,
        {
          pressureLevel: pressure,
          reaction: pressure >= 3 ? "cracked" : pressure >= 2 ? "doubled_down" : "deflected",
          lastReactedTurn: input.currentTurn,
        },
      ])),
    };
  });
}

export function computeContradictionPressure(input: {
  contradiction: ContradictionRecord;
  inquiryFrame: CaseInquiryFrame;
}): 0 | 1 | 2 | 3 {
  if (input.inquiryFrame.inquiryType !== "contradiction_challenge") {
    return 0;
  }
  const refCount = input.inquiryFrame.referencedClaimIds.length + input.inquiryFrame.referencedEvidenceIds.length;
  if (input.contradiction.severity >= 3 && refCount >= 2) return 3;
  if (input.contradiction.severity >= 2 || refCount >= 2) return 2;
  return 1;
}

function classifyConflict(left: Claim, right: Claim): ContradictionRecord["conflictType"] | null {
  const sharedObjects = objectRefs(left).filter((objectId) => objectRefs(right).includes(objectId));
  if (sharedObjects.length > 0 && polarity(left.content) !== polarity(right.content)) {
    return "object_conflict";
  }
  const sharedLocations = locationRefs(left).filter((locationId) => locationRefs(right).includes(locationId));
  if (sharedLocations.length === 0 && looksLikeAlibi(left) && looksLikeAlibi(right) && speakerOf(left) === speakerOf(right)) {
    return "location_conflict";
  }
  if (looksLikeAlibi(left) && polarity(left.content) !== polarity(right.content)) {
    return "alibi_conflict";
  }
  return null;
}

function polarity(text: string): "present" | "missing" {
  return /(없|사라|못\s*봤|아니|없었|없댔)/.test(text) ? "missing" : "present";
}

function looksLikeAlibi(claim: Claim): boolean {
  return claim.claimType === "alibi" || /(정전중|혼자|있었|없었|라운지|서재|복도)/.test(claim.content.replace(/\s+/g, ""));
}

function objectRefs(claim: Claim): string[] {
  return claim.referencedObjectIds ?? claim.references?.filter((ref) => ref.includes("key") || ref.includes("object")) ?? [];
}

function locationRefs(claim: Claim): string[] {
  return claim.referencedLocationIds ?? claim.references?.filter((ref) => ref.includes("lodge") || ref.includes("room")) ?? [];
}

function speakerOf(claim: Claim): string {
  return claim.speakerId ?? claim.speaker;
}

function hasExisting(records: ContradictionRecord[], leftId: string, rightId: string): boolean {
  return records.some((record) =>
    (record.claimAId === leftId && record.claimBId === rightId)
    || (record.claimAId === rightId && record.claimBId === leftId),
  );
}
