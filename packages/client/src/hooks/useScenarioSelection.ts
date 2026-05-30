import { useEffect, useState } from "react";
import { getScenarioDetail, listScenarios, type V2ScenarioDetailResponse } from "../api-v2";

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

export function useScenarioSelection(onDetailError?: (message: string | null) => void): ScenarioSelectionState {
  const [setupStep, setSetupStep] = useState<SetupStep>("scenario");
  const [scenarioList, setScenarioList] = useState<string[]>([]);
  const [isScenarioListLoading, setIsScenarioListLoading] = useState(true);
  const [scenarioListError, setScenarioListError] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [selectedScenarioDetail, setSelectedScenarioDetail] = useState<V2ScenarioDetailResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsScenarioListLoading(true);
    setScenarioListError(null);

    listScenarios()
      .then((scenarios) => {
        if (!cancelled) {
          setScenarioList(scenarios);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setScenarioList([]);
          setScenarioListError(reason instanceof Error ? reason.message : "시나리오 목록을 불러올 수 없습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsScenarioListLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedScenario) {
      setSelectedScenarioDetail(null);
      return;
    }

    let cancelled = false;
    setSelectedScenarioDetail(null);
    onDetailError?.(null);

    getScenarioDetail(selectedScenario)
      .then((detail) => {
        if (!cancelled) {
          setSelectedScenarioDetail(detail);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          onDetailError?.(reason instanceof Error ? reason.message : "시나리오 정보를 불러올 수 없습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onDetailError, selectedScenario]);

  function resetScenarioSelection() {
    setSetupStep("scenario");
    setSelectedScenario("");
    setSelectedScenarioDetail(null);
  }

  return {
    setupStep,
    scenarioList,
    isScenarioListLoading,
    scenarioListError,
    selectedScenario,
    selectedScenarioDetail,
    setSetupStep,
    setSelectedScenario,
    resetScenarioSelection,
  };
}
