"use client";

import { useRef, useEffect } from "react";
import { useAtom } from "jotai/react";
import { renderStatusAtom, renderLogsAtom } from "@/store/config";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RenderConsole() {
  const [renderStatus, setRenderStatus] = useAtom(renderStatusAtom);
  const [renderLogs, setRenderLogs] = useAtom(renderLogsAtom);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [renderLogs]);

  if (renderStatus === "idle" && renderLogs.length === 0) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            renderStatus === "running" && "animate-pulse bg-warning",
            renderStatus === "done" && "bg-success",
            renderStatus === "error" && "bg-destructive",
            renderStatus === "idle" && "bg-muted-foreground/30",
          )}
        />
        <span className="text-[11px] text-muted-foreground">
          {renderStatus === "running"
            ? "Recording..."
            : renderStatus === "done"
              ? "Recording complete"
              : renderStatus === "error"
                ? "Recording failed"
                : "Output"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {renderLogs.length > 0 && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setRenderLogs([]);
                setRenderStatus("idle");
              }}
              title="Clear"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-card/80 px-3 py-2">
        {renderLogs.map((line, i) => (
          <div
            key={i}
            className={cn(
              "font-mono text-[10px] leading-relaxed",
              line.startsWith("[err]") ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {line.startsWith("[err]") ? line.slice(5) : line}
          </div>
        ))}
        {renderLogs.length === 0 && (
          <p className="text-[10px] text-muted-foreground/40">No output yet</p>
        )}
      </div>
    </div>
  );
}
