import type { DirectorOutput, InputMode, PublicContext, ScenarioPack } from "@hushline/shared";

export function buildNarratorInstruction(
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
