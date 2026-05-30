import type { CaseRuntimeTrace, StateLawSnapshot } from "@hushline/shared";

export function summarizeStateLawForDevPanel(stateLaw: StateLawSnapshot | null | undefined): string[] {
  if (!stateLaw) return [];
  return [
    ...stateLaw.immutableFacts.map((item) => `고정: ${item}`),
    ...stateLaw.scenePressure.map((item) => `압력: ${item}`),
    ...stateLaw.outputRules.map((item) => `규칙: ${item}`),
  ];
}

export function summarizeCaseRuntimeForDevPanel(caseRuntime: CaseRuntimeTrace | null | undefined): string[] {
  if (!caseRuntime) return [];
  const { inquiry, answerScope, boundarySummary } = caseRuntime;
  const devTrace = caseRuntime.devTrace;
  return [
    `질문: ${inquiry.inquiryType} · 위험 ${inquiry.truthLeakRisk}`,
    inquiry.topicTags.length ? `주제: ${inquiry.topicTags.join(", ")}` : "주제: (없음)",
    devTrace?.contradictionIds.length ? `모순: ${devTrace.contradictionIds.join(", ")}` : "모순: (없음)",
    devTrace?.deductionVerdict ? `추리 판정: ${devTrace.deductionVerdict}` : "추리 판정: (없음)",
    devTrace?.snapshotId ? `스냅샷: ${devTrace.snapshotId}` : "스냅샷: (없음)",
    devTrace?.characterGate ? `Character Gate: ${JSON.stringify(devTrace.characterGate)}` : "Character Gate: (없음)",
    devTrace?.narratorGate ? `Narrator Gate: ${JSON.stringify(devTrace.narratorGate)}` : "Narrator Gate: (없음)",
    `답변성: ${answerScope.answerability}`,
    answerScope.recommendedSpeakerIds.length
      ? `추천 화자: ${answerScope.recommendedSpeakerIds.join(", ")}`
      : "추천 화자: (없음)",
    answerScope.publicFactIds.length ? `공개 사실: ${answerScope.publicFactIds.join(", ")}` : "공개 사실: (없음)",
    answerScope.observableFactIds.length ? `관찰 사실: ${answerScope.observableFactIds.join(", ")}` : "관찰 사실: (없음)",
    answerScope.allowedWitnesses.length
      ? `허용 증언: ${answerScope.allowedWitnesses.map((witness) => `${witness.characterId}:${witness.factIds.join("/")}`).join(", ")}`
      : "허용 증언: (없음)",
    answerScope.blockedFactIds.length ? `차단 사실: ${answerScope.blockedFactIds.join(", ")}` : "차단 사실: (없음)",
    answerScope.blockedTruthIds.length ? `차단 진상: ${answerScope.blockedTruthIds.join(", ")}` : "차단 진상: (없음)",
    ...boundarySummary.map((item) => `Gate: ${item}`),
  ];
}
