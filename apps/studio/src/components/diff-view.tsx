"use client";

import { useMemo } from "react";
import { useAtomValue } from "jotai/react";
import { configJsonAtom, savedConfigJsonAtom, isDirtyAtom } from "@/store/config";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function computeDiff(
  oldLines: string[],
  newLines: string[],
): Array<{ type: "same" | "add" | "remove"; line: string; lineNumber: number }> {
  const result: Array<{
    type: "same" | "add" | "remove";
    line: string;
    lineNumber: number;
  }> = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  let oi = 0;
  let ni = 0;
  let lineNum = 1;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: "same", line: newLines[ni], lineNumber: lineNum });
      oi++;
      ni++;
    } else if (
      oi < oldLines.length &&
      (ni >= newLines.length || oldLines[oi] !== newLines[ni])
    ) {
      result.push({ type: "remove", line: oldLines[oi], lineNumber: lineNum });
      oi++;
    } else {
      result.push({ type: "add", line: newLines[ni], lineNumber: lineNum });
      ni++;
    }
    lineNum++;
    if (lineNum > maxLen + 100) break;
  }

  return result;
}

export function DiffView() {
  const configJson = useAtomValue(configJsonAtom);
  const savedConfigJson = useAtomValue(savedConfigJsonAtom);
  const isDirty = useAtomValue(isDirtyAtom);

  const diff = useMemo(() => {
    if (!isDirty) return [];
    const oldLines = savedConfigJson.split("\n");
    const newLines = configJson.split("\n");
    return computeDiff(oldLines, newLines);
  }, [configJson, savedConfigJson, isDirty]);

  if (!isDirty) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-xs text-muted-foreground">No unsaved changes.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-1 py-2">
        <div className="font-mono text-[11px] leading-relaxed">
          {diff.map((entry, i) => (
            <div
              key={i}
              className={cn(
                "flex whitespace-pre px-2",
                entry.type === "add" && "bg-green-500/10 text-green-400",
                entry.type === "remove" && "bg-red-500/10 text-red-400",
                entry.type === "same" && "text-muted-foreground",
              )}
            >
              <span className="mr-3 w-4 shrink-0 text-right text-muted-foreground/40">
                {entry.type === "add" ? "+" : entry.type === "remove" ? "-" : " "}
              </span>
              <span>{entry.line}</span>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
