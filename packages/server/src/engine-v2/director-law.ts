import type { BoundaryReport, DirectorOutput, ScenarioPack, StateLawSnapshot, WorldState } from "@hushline/shared";
import { enforceDirectorBoundary } from "./boundary.js";
import { buildStateLawSnapshot } from "./state-law.js";

export function enforceDirectorLaw(
  directorOutput: DirectorOutput,
  worldState: WorldState,
  pack: ScenarioPack,
): { output: DirectorOutput; report: BoundaryReport; stateLaw: StateLawSnapshot } {
  const boundary = enforceDirectorBoundary(directorOutput, worldState, pack);
  return {
    ...boundary,
    stateLaw: buildStateLawSnapshot(worldState, pack),
  };
}
