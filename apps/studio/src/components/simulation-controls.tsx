"use client";

import { useCallback } from "react";
import { useAtom, useAtomValue } from "jotai/react";
import {
  selectedVideoConfigAtom,
  selectedStepIndexAtom,
  simulationStatusAtom,
  simulationSpeedAtom,
  simulationStepAtom,
  highlightFoundAtom,
  previewModeAtom,
} from "@/store/config";
import type { Step } from "@/store/config";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Square,
  SkipBack,
  SkipForward,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_DESCRIPTIONS: Record<string, (step: Step) => string> = {
  click: (s) => `Click ${s.text || s.selector || "element"}`,
  type: (s) => `Type "${s.text}"${s.selector ? ` into ${s.selector}` : ""}`,
  key: (s) => `Press ${s.key}`,
  pause: (s) => `Wait ${s.ms}ms`,
  wait: (s) =>
    `Wait for ${s.selector || s.text || "condition"}${s.timeout ? ` (${s.timeout}ms timeout)` : ""}`,
  scroll: (s) => `Scroll ${s.selector || "page"} by (${s.x ?? 0}, ${s.y ?? 0})`,
  navigate: (s) => `Navigate to ${s.url}`,
  screenshot: (s) => `Capture screenshot: ${s.output}`,
  hover: (s) => `Hover ${s.text || s.selector || "element"}`,
  drag: () => `Drag from source to target`,
  select: (s) => `Select "${s.value}" in ${s.selector || "element"}`,
  moveTo: (s) => `Move cursor to ${s.text || s.selector || "element"}`,
};

function describeStep(step: Step): string {
  const fn = ACTION_DESCRIPTIONS[step.action];
  return fn ? fn(step) : step.action;
}

interface SimulationControlsProps {
  onPlay: (fromStep?: number) => void;
  onStop: () => void;
  onStepForward: (stepIndex: number) => void;
  iframeReady: boolean;
  replaying?: boolean;
  replayProgress?: number;
  replayTarget?: number;
}

export function SimulationControls({
  onPlay,
  onStop,
  onStepForward,
  iframeReady,
  replaying,
  replayProgress,
  replayTarget,
}: SimulationControlsProps) {
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const [currentStep, setCurrentStep] = useAtom(selectedStepIndexAtom);
  const simulationStatus = useAtomValue(simulationStatusAtom);
  const [speed, setSpeed] = useAtom(simulationSpeedAtom);
  const simStep = useAtomValue(simulationStepAtom);
  const highlightFound = useAtomValue(highlightFoundAtom);
  const [previewMode, setPreviewMode] = useAtom(previewModeAtom);
  const steps = videoConfig?.steps ?? [];

  const activeStep = simulationStatus === "playing" ? simStep : currentStep;
  const step = activeStep >= 0 && activeStep < steps.length ? steps[activeStep] : null;

  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < steps.length) {
        setCurrentStep(index);
      }
    },
    [steps.length, setCurrentStep],
  );

  const handlePlayPause = useCallback(() => {
    if (simulationStatus === "playing") {
      onStop();
    } else {
      const start = previewMode === "full" ? 0 : currentStep >= 0 ? currentStep : 0;
      onPlay(start);
    }
  }, [simulationStatus, currentStep, previewMode, onPlay, onStop]);

  const handleStepForward = useCallback(() => {
    const next = currentStep + 1;
    if (next < steps.length) {
      setCurrentStep(next);
      onStepForward(next);
    }
  }, [currentStep, steps.length, setCurrentStep, onStepForward]);

  const handleStepBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep, setCurrentStep]);

  if (!videoConfig || steps.length === 0) return null;

  const isPlaying = simulationStatus === "playing";
  const isBusy = isPlaying || !!replaying;
  const showNotFound = highlightFound === false && step && !isBusy;

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b bg-card px-3 py-1.5">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => goToStep(0)}
        disabled={activeStep <= 0 || isBusy}
        title="First step"
      >
        <SkipBack className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleStepBack}
        disabled={activeStep <= 0 || isBusy}
        title="Previous step"
      >
        <ChevronLeft className="size-3" />
      </Button>

      <Button
        variant={isPlaying ? "default" : "ghost"}
        size="icon-xs"
        onClick={handlePlayPause}
        disabled={!iframeReady || replaying}
        title={isPlaying ? "Stop simulation" : "Play simulation"}
        className={cn(isPlaying && "bg-emerald-600 text-white hover:bg-emerald-700")}
      >
        {isPlaying ? <Square className="size-3" /> : <Play className="size-3" />}
      </Button>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleStepForward}
        disabled={activeStep >= steps.length - 1 || isBusy || !iframeReady}
        title="Step forward (simulate)"
      >
        <ChevronRight className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => goToStep(steps.length - 1)}
        disabled={activeStep >= steps.length - 1 || isBusy}
        title="Last step"
      >
        <SkipForward className="size-3" />
      </Button>

      <div className="mx-1 h-3 w-px bg-border" />

      <span className="text-[10px] tabular-nums text-muted-foreground">
        {activeStep >= 0 ? activeStep + 1 : "-"}/{steps.length}
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {replaying && replayProgress != null && replayTarget != null ? (
          <span className="flex items-center gap-1.5 text-[11px] text-blue-400">
            <span className="size-1.5 animate-pulse rounded-full bg-blue-400" />
            Replaying {replayProgress + 1}/{replayTarget}...
          </span>
        ) : step ? (
          <span className="truncate text-[11px]">{describeStep(step)}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Select a step or press play
          </span>
        )}
        {showNotFound && (
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-warning">
            <AlertCircle className="size-3" />
            Not found
          </span>
        )}
      </div>

      <Select value={String(speed)} onValueChange={(v) => setSpeed(parseFloat(v))}>
        <SelectTrigger className="h-6 w-16 text-[10px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0.5">0.5x</SelectItem>
          <SelectItem value="1">1x</SelectItem>
          <SelectItem value="2">2x</SelectItem>
          <SelectItem value="4">4x</SelectItem>
        </SelectContent>
      </Select>

      <div className="mx-1 h-3 w-px bg-border" />

      <div className="flex h-6 items-center rounded-md border bg-muted/50 p-0.5">
        {(["full", "step"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPreviewMode(mode)}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
              previewMode === mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {mode === "full" ? "Full" : "Step"}
          </button>
        ))}
      </div>
    </div>
  );
}
