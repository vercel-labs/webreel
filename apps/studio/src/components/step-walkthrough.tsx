"use client";

import { useCallback } from "react";
import { useAtom, useAtomValue } from "jotai/react";
import { selectedVideoConfigAtom, selectedStepIndexAtom } from "@/store/config";
import type { Step } from "@/store/config";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Square, SkipBack } from "lucide-react";

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

interface StepWalkthroughProps {
  active: boolean;
  onToggle: () => void;
}

export function StepWalkthrough({ active, onToggle }: StepWalkthroughProps) {
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const [currentStep, setCurrentStep] = useAtom(selectedStepIndexAtom);
  const steps = videoConfig?.steps ?? [];

  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < steps.length) {
        setCurrentStep(index);
      }
    },
    [steps.length, setCurrentStep],
  );

  const step = currentStep >= 0 && currentStep < steps.length ? steps[currentStep] : null;
  const descFn = step ? ACTION_DESCRIPTIONS[step.action] : null;
  const description = step && descFn ? descFn(step) : step ? step.action : "";

  if (!active || !videoConfig) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-1.5">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => goToStep(0)}
        disabled={currentStep <= 0}
        title="First step"
      >
        <SkipBack className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => goToStep(currentStep - 1)}
        disabled={currentStep <= 0}
        title="Previous step"
      >
        <ChevronLeft className="size-3" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {currentStep >= 0 ? currentStep + 1 : "-"}/{steps.length}
        </span>
        {step && <span className="truncate text-[11px]">{description}</span>}
        {!step && (
          <span className="text-[11px] text-muted-foreground">
            Select a step to start walkthrough
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => goToStep(currentStep + 1)}
        disabled={currentStep >= steps.length - 1}
        title="Next step"
      >
        <ChevronRight className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onToggle}
        title="Exit walkthrough"
        className="text-muted-foreground"
      >
        <Square className="size-3" />
      </Button>
    </div>
  );
}
