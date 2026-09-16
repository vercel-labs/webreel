"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useAtom, useAtomValue } from "jotai/react";
import {
  renderStatusAtom,
  renderLogsAtom,
  lastRenderOutputAtom,
  configJsonAtom,
  parsedConfigAtom,
  selectedVideoAtom,
} from "@/store/config";
import { useTheme } from "next-themes";

export function useRender() {
  const [renderStatus, setRenderStatus] = useAtom(renderStatusAtom);
  const [renderLogs, setRenderLogs] = useAtom(renderLogsAtom);
  const [lastRenderOutput, setLastRenderOutput] = useAtom(lastRenderOutputAtom);
  const configJson = useAtomValue(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const { resolvedTheme } = useTheme();
  const abortRef = useRef<AbortController | null>(null);
  const recordingStartRef = useRef(0);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  useEffect(() => {
    if (renderStatus === "running") {
      recordingStartRef.current = Date.now();
      setRecordingElapsed(0);
      const interval = setInterval(() => {
        setRecordingElapsed(Math.floor((Date.now() - recordingStartRef.current) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [renderStatus]);

  const startRender = useCallback(
    async (videos?: string[]) => {
      if (renderStatus === "running" || !config) return;
      const videosToRecord = videos ?? (selectedVideo ? [selectedVideo] : []);
      if (videosToRecord.length === 0) return;

      setRenderStatus("running");
      setRenderLogs([]);
      setLastRenderOutput(null);

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const parsedConfig = JSON.parse(configJson);
        if (parsedConfig.colorScheme === undefined) {
          parsedConfig.colorScheme = resolvedTheme === "dark" ? "dark" : "light";
        }
        const response = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config: parsedConfig,
            videos: videosToRecord.length > 1 ? videosToRecord : undefined,
            video: videosToRecord.length === 1 ? videosToRecord[0] : undefined,
          }),
          signal: abort.signal,
        });

        if (!response.ok || !response.body) {
          setRenderStatus("error");
          setRenderLogs((prev) => [
            ...prev,
            `[err]HTTP ${response.status}: ${response.statusText}`,
          ]);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as { type: string; data: string };
              if (event.type === "stdout") {
                setRenderLogs((prev) => [...prev, event.data]);
                const outputMatch = event.data.match(/Done:\s*(.+\.(mp4|webm|gif))/i);
                if (outputMatch) setLastRenderOutput(outputMatch[1]);
              } else if (event.type === "stderr") {
                setRenderLogs((prev) => [...prev, `[err]${event.data}`]);
              } else if (event.type === "exit") {
                const code = parseInt(event.data, 10);
                setRenderStatus(code === 0 ? "done" : "error");
              } else if (event.type === "error") {
                setRenderLogs((prev) => [...prev, `[err]${event.data}`]);
                setRenderStatus("error");
              }
            } catch {
              // malformed SSE frame
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setRenderStatus("error");
          setRenderLogs((prev) => [
            ...prev,
            `[err]${err instanceof Error ? err.message : "Unknown error"}`,
          ]);
        }
      } finally {
        abortRef.current = null;
      }
    },
    [
      renderStatus,
      config,
      configJson,
      selectedVideo,
      resolvedTheme,
      setRenderStatus,
      setRenderLogs,
      setLastRenderOutput,
    ],
  );

  const stopRender = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setRenderStatus("idle");
      setRenderLogs((prev) => [...prev, "Cancelled by user"]);
    }
  }, [setRenderStatus, setRenderLogs]);

  return {
    renderStatus,
    renderLogs,
    lastRenderOutput,
    recordingElapsed,
    startRender,
    stopRender,
  };
}
