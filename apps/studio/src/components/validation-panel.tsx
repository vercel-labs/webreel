"use client";

import { useAtomValue, useSetAtom } from "jotai/react";
import {
  validationIssuesAtom,
  errorCountAtom,
  warningCountAtom,
} from "@/store/validation";
import { selectedVideoAtom, selectedStepIndexAtom } from "@/store/config";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function ValidationPanel() {
  const issues = useAtomValue(validationIssuesAtom);
  const errorCount = useAtomValue(errorCountAtom);
  const warningCount = useAtomValue(warningCountAtom);
  const setSelectedVideo = useSetAtom(selectedVideoAtom);
  const setSelectedStep = useSetAtom(selectedStepIndexAtom);

  if (issues.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-xs text-success">No issues found.</p>
      </div>
    );
  }

  function navigateToIssue(path: string) {
    const videoMatch = path.match(/^videos\.([^.]+)/);
    if (videoMatch) {
      setSelectedVideo(videoMatch[1]);
      const stepMatch = path.match(/steps\[(\d+)\]/);
      if (stepMatch) {
        setSelectedStep(parseInt(stepMatch[1], 10));
      }
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <div className="mb-2 flex items-center gap-3 px-1 text-[10px] text-muted-foreground">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="size-3" />
              {errorCount} error{errorCount > 1 ? "s" : ""}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle className="size-3" />
              {warningCount} warning{warningCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="space-y-0.5">
          {issues.map((issue, i) => (
            <button
              key={i}
              type="button"
              onClick={() => navigateToIssue(issue.path)}
              className={cn(
                "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50",
              )}
            >
              {issue.level === "error" ? (
                <AlertCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
              ) : (
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
              )}
              <div className="min-w-0">
                <p className="text-xs">{issue.message}</p>
                {issue.path && (
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {issue.path}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

export function ValidationBadge() {
  const errorCount = useAtomValue(errorCountAtom);
  const warningCount = useAtomValue(warningCountAtom);

  if (errorCount === 0 && warningCount === 0) return null;

  return (
    <span className="flex items-center gap-1">
      {errorCount > 0 && (
        <span className="flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
          {errorCount}
        </span>
      )}
      {warningCount > 0 && errorCount === 0 && (
        <span className="flex size-4 items-center justify-center rounded-full bg-warning text-[9px] font-bold text-warning-foreground">
          {warningCount}
        </span>
      )}
    </span>
  );
}
