"use client";

import { useRef, useCallback, useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai/react";
import {
  selectedVideoConfigAtom,
  selectedStepIndexAtom,
  simulationStatusAtom,
  simulationSpeedAtom,
  simulationStepAtom,
  highlightFoundAtom,
  replayStateAtom,
  replayedThroughStepAtom,
  pickModeAtom,
} from "@/store/config";
import type { Step } from "@/store/config";
import { sendToIframe } from "@/lib/preview-utils";

export function useSimulation(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  iframeReady: boolean,
  iframeSrc: string | null,
) {
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const selectedStep = useAtomValue(selectedStepIndexAtom);
  const pickMode = useAtomValue(pickModeAtom);
  const [simulationStatus, setSimulationStatus] = useAtom(simulationStatusAtom);
  const simulationSpeed = useAtomValue(simulationSpeedAtom);
  const setSimulationStep = useSetAtom(simulationStepAtom);
  const setHighlightFound = useSetAtom(highlightFoundAtom);
  const [replayState, setReplayState] = useAtom(replayStateAtom);
  const [replayedThrough, setReplayedThrough] = useAtom(replayedThroughStepAtom);
  const replayAbortRef = useRef(false);
  const readyResolverRef = useRef<(() => void) | null>(null);
  const executeResolverRef = useRef<(() => void) | null>(null);

  const resolveReady = useCallback(() => {
    if (readyResolverRef.current) {
      readyResolverRef.current();
      readyResolverRef.current = null;
    }
    if (executeResolverRef.current) {
      executeResolverRef.current();
      executeResolverRef.current = null;
    }
  }, []);

  const resolveExecute = useCallback(() => {
    if (executeResolverRef.current) {
      executeResolverRef.current();
      executeResolverRef.current = null;
    }
  }, []);

  const handleSimulationProgress = useCallback(
    (index: number) => setSimulationStep(index),
    [setSimulationStep],
  );

  const handleSimulationComplete = useCallback(() => {
    setSimulationStatus("idle");
    setSimulationStep(-1);
  }, [setSimulationStatus, setSimulationStep]);

  const waitForReady = useCallback(() => {
    return new Promise<void>((resolve) => {
      readyResolverRef.current = resolve;
    });
  }, []);

  const waitForExecute = useCallback(() => {
    return new Promise<void>((resolve) => {
      executeResolverRef.current = resolve;
    });
  }, []);

  const replayToStep = useCallback(
    async (targetIndex: number) => {
      if (!videoConfig || !iframeSrc || pickMode) return;
      const steps = videoConfig.steps;
      if (targetIndex < 0 || targetIndex >= steps.length) {
        if (targetIndex < 0) {
          setReplayState({ status: "idle", targetStep: -1, currentStep: -1 });
          setReplayedThrough(-1);
          sendToIframe(iframeRef, "webreel:highlight:clear");
          setHighlightFound(null);
        }
        return;
      }

      const canFastForward = replayedThrough >= 0 && targetIndex > replayedThrough;
      const startFrom = canFastForward ? replayedThrough + 1 : 0;

      replayAbortRef.current = false;
      setReplayState({
        status: "replaying",
        targetStep: targetIndex,
        currentStep: startFrom,
      });

      if (!canFastForward) {
        const readyPromise = waitForReady();
        if (iframeRef.current) {
          iframeRef.current.src = iframeSrc;
        }
        await readyPromise;
        if (replayAbortRef.current) return;
      }

      sendToIframe(iframeRef, "webreel:safeguards:enable");

      for (let i = startFrom; i < targetIndex; i++) {
        if (replayAbortRef.current) break;
        setReplayState((prev) => ({ ...prev, currentStep: i }));

        const step = steps[i] as Step;
        const isNav = step.action === "navigate";

        if (isNav) {
          const execPromise = waitForReady();
          sendToIframe(iframeRef, "webreel:execute", { step, index: i });
          await execPromise;
          if (replayAbortRef.current) break;
          sendToIframe(iframeRef, "webreel:safeguards:enable");
        } else {
          const execPromise = waitForExecute();
          sendToIframe(iframeRef, "webreel:execute", { step, index: i });
          await execPromise;
          if (replayAbortRef.current) break;
        }
      }

      sendToIframe(iframeRef, "webreel:safeguards:disable");

      if (!replayAbortRef.current) {
        setReplayedThrough(targetIndex - 1);

        const targetStep = steps[targetIndex];
        const selector = targetStep.selector as string | undefined;
        const text = targetStep.text as string | undefined;
        const within = targetStep.within as string | undefined;
        if (selector || text) {
          sendToIframe(iframeRef, "webreel:highlight", { selector, text, within });
        } else {
          sendToIframe(iframeRef, "webreel:highlight:clear");
          setHighlightFound(null);
        }
      }

      setReplayState({
        status: "idle",
        targetStep: targetIndex,
        currentStep: targetIndex,
      });
    },
    [
      videoConfig,
      iframeSrc,
      pickMode,
      replayedThrough,
      waitForReady,
      waitForExecute,
      setReplayState,
      setReplayedThrough,
      setHighlightFound,
      iframeRef,
    ],
  );

  useEffect(() => {
    if (!iframeReady || pickMode) return;
    if (simulationStatus === "playing") return;
    if (replayState.status === "replaying") return;

    if (selectedStep < 0) {
      sendToIframe(iframeRef, "webreel:highlight:clear");
      setHighlightFound(null);
      return;
    }

    const steps = videoConfig?.steps ?? [];
    if (selectedStep >= steps.length) return;

    if (selectedStep === 0) {
      if (replayedThrough !== -1) {
        setReplayedThrough(-1);
        const readyPromise = waitForReady();
        if (iframeRef.current && iframeSrc) {
          iframeRef.current.src = iframeSrc;
        }
        readyPromise.then(() => {
          const step = steps[0];
          const selector = step.selector as string | undefined;
          const text = step.text as string | undefined;
          const within = step.within as string | undefined;
          if (selector || text) {
            sendToIframe(iframeRef, "webreel:highlight", { selector, text, within });
          }
        });
      } else {
        const step = steps[0];
        const selector = step.selector as string | undefined;
        const text = step.text as string | undefined;
        const within = step.within as string | undefined;
        if (selector || text) {
          sendToIframe(iframeRef, "webreel:highlight", { selector, text, within });
        } else {
          sendToIframe(iframeRef, "webreel:highlight:clear");
          setHighlightFound(null);
        }
      }
      return;
    }

    replayToStep(selectedStep);
    // selectedStep is the primary trigger; other deps are stable refs/setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStep]);

  useEffect(() => {
    setReplayedThrough(-1);
    replayAbortRef.current = true;
    setReplayState({ status: "idle", targetStep: -1, currentStep: -1 });
  }, [iframeSrc, setReplayedThrough, setReplayState]);

  const startSimulation = useCallback(
    (fromStep?: number) => {
      if (!iframeReady || !videoConfig) return;
      const steps = videoConfig.steps;
      if (steps.length === 0) return;
      setSimulationStatus("playing");
      setSimulationStep(fromStep ?? 0);
      sendToIframe(iframeRef, "webreel:reset");
      setTimeout(() => {
        sendToIframe(iframeRef, "webreel:simulate:run", {
          steps,
          speed: simulationSpeed,
          startIndex: fromStep ?? 0,
        });
      }, 100);
    },
    [
      iframeReady,
      videoConfig,
      simulationSpeed,
      setSimulationStatus,
      setSimulationStep,
      iframeRef,
    ],
  );

  const stopSimulation = useCallback(() => {
    sendToIframe(iframeRef, "webreel:simulate:stop");
    setSimulationStatus("idle");
    setSimulationStep(-1);
    sendToIframe(iframeRef, "webreel:reset");
  }, [setSimulationStatus, setSimulationStep, iframeRef]);

  const simulateOneStep = useCallback(
    (stepIndex: number) => {
      if (!iframeReady || !videoConfig) return;
      const steps = videoConfig.steps;
      if (stepIndex < 0 || stepIndex >= steps.length) return;
      sendToIframe(iframeRef, "webreel:simulate:step", {
        step: steps[stepIndex],
        index: stepIndex,
        total: steps.length,
        speed: simulationSpeed,
      });
    },
    [iframeReady, videoConfig, simulationSpeed, iframeRef],
  );

  return {
    replayState,
    simulationStatus,
    resolveReady,
    resolveExecute,
    handleSimulationProgress,
    handleSimulationComplete,
    startSimulation,
    stopSimulation,
    simulateOneStep,
    setHighlightFound,
    setSimulationStep,
    setSimulationStatus,
  };
}
