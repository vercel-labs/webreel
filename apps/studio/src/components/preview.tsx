"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useAtom, useAtomValue } from "jotai/react";
import {
  selectedVideoConfigAtom,
  parsedConfigAtom,
  selectedVideoAtom,
  pickModeAtom,
  pickedSelectorAtom,
  videoNamesAtom,
  renderStatusAtom,
  renderLogsAtom,
  lastRenderOutputAtom,
} from "@/store/config";
import {
  Globe,
  RefreshCw,
  ExternalLink,
  Crosshair,
  Copy,
  X,
  Play,
  Pause,
  Square,
  Film,
  Download,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { SimulationControls } from "@/components/simulation-controls";
import { RenderConsole } from "@/components/render-console";
import { PreviewWithChrome } from "@/components/preview-chrome";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
  buildCursorStyle,
  useContainerSize,
  resolvePreviewUrl,
  buildThemePayload,
  formatElapsed,
  sendToIframe,
} from "@/lib/preview-utils";
import { useRender } from "@/hooks/use-render";
import { useSimulation } from "@/hooks/use-simulation";

export function Preview() {
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const videoNames = useAtomValue(videoNamesAtom);
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerSize = useContainerSize(containerRef);
  const [iframeKey, setIframeKey] = useState(0);
  const [pickMode, setPickMode] = useAtom(pickModeAtom);
  const [pickedSelector, setPickedSelector] = useAtom(pickedSelectorAtom);
  const [copied, setCopied] = useState(false);
  const [canvasMode, setCanvasMode] = useState<"preview" | "playback">("preview");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [iframeReady, setIframeReady] = useState(false);
  const renderStatus = useAtomValue(renderStatusAtom);
  const renderLogs = useAtomValue(renderLogsAtom);
  const lastRenderOutput = useAtomValue(lastRenderOutputAtom);

  const { recordingElapsed, startRender, stopRender } = useRender();

  const cursorSize =
    videoConfig?.theme?.cursor?.size ?? config?.theme?.cursor?.size ?? 24;
  const cursorHotspot =
    videoConfig?.theme?.cursor?.hotspot ?? config?.theme?.cursor?.hotspot ?? "top-left";
  const previewCursor = useMemo(
    () => buildCursorStyle(cursorSize, cursorHotspot),
    [cursorSize, cursorHotspot],
  );

  const vpWidth =
    typeof videoConfig?.viewport === "object"
      ? (videoConfig.viewport?.width ?? 1920)
      : 1920;
  const vpHeight =
    typeof videoConfig?.viewport === "object"
      ? (videoConfig.viewport?.height ?? 1080)
      : 1080;

  const screenCfg = videoConfig?.screen;
  const windowCfg = videoConfig?.window;
  const backgroundCfg = videoConfig?.background;
  const hasChrome = !!screenCfg;

  const titlebarVisible = windowCfg?.titlebar?.visible ?? false;
  const titlebarH = titlebarVisible ? (windowCfg?.titlebar?.height ?? 36) : 0;
  const borderRadius = windowCfg?.borderRadius ?? (titlebarVisible ? 10 : 0);

  const canvasW = hasChrome ? screenCfg.width : vpWidth;
  const canvasH = hasChrome ? screenCfg.height : vpHeight;

  const padding = 32;
  const availW = Math.max(containerSize.width - padding * 2, 1);
  const availH = Math.max(containerSize.height - padding * 2, 1);
  const scale = Math.min(availW / canvasW, availH / canvasH, 1);

  const resolvedUrl = videoConfig
    ? resolvePreviewUrl(videoConfig.url, videoConfig.baseUrl, config?.baseUrl)
    : null;

  const isLoadable =
    resolvedUrl &&
    (resolvedUrl.startsWith("http://") || resolvedUrl.startsWith("https://"));

  const iframeSrc = isLoadable
    ? `/api/proxy?url=${encodeURIComponent(resolvedUrl)}&mode=preview`
    : null;

  const showConsole =
    canvasMode !== "playback" && (renderStatus !== "idle" || renderLogs.length > 0);

  const {
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
  } = useSimulation(iframeRef, iframeReady, iframeSrc);

  const reload = useCallback(() => {
    setIframeReady(false);
    setIframeKey((k) => k + 1);
  }, []);

  const togglePickMode = useCallback(() => {
    setPickMode((prev) => {
      const next = !prev;
      sendToIframe(iframeRef, next ? "webreel:pick:enable" : "webreel:pick:disable");
      return next;
    });
    setPickedSelector(null);
    setCopied(false);
  }, [setPickMode, setPickedSelector]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data || typeof e.data.type !== "string") return;

      switch (e.data.type) {
        case "webreel:pick":
          if (e.data.payload && typeof e.data.payload.selector === "string") {
            setPickedSelector(e.data.payload.selector);
            setPickMode(false);
          }
          break;
        case "webreel:ready":
          setIframeReady(true);
          resolveReady();
          break;
        case "webreel:execute:done":
          resolveExecute();
          break;
        case "webreel:highlight:result":
          setHighlightFound(e.data.payload?.found ?? null);
          break;
        case "webreel:simulate:progress":
          if (typeof e.data.payload?.index === "number") {
            handleSimulationProgress(e.data.payload.index);
          }
          break;
        case "webreel:simulate:complete":
          handleSimulationComplete();
          break;
        case "webreel:step:done":
          break;
        case "webreel:navigate":
          if (e.data.payload?.url && resolvedUrl) {
            const newUrl = new URL(e.data.payload.url as string, resolvedUrl).href;
            if (iframeRef.current) {
              setIframeReady(false);
              iframeRef.current.src = `/api/proxy?url=${encodeURIComponent(newUrl)}&mode=preview`;
            }
          }
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    setPickedSelector,
    setPickMode,
    setHighlightFound,
    setSimulationStep,
    setSimulationStatus,
    resolvedUrl,
    resolveReady,
    resolveExecute,
    handleSimulationProgress,
    handleSimulationComplete,
  ]);

  const effectiveColorScheme =
    videoConfig?.colorScheme ?? (resolvedTheme === "dark" ? "dark" : "light");

  useEffect(() => {
    if (!iframeReady || pickMode) return;
    const themePayload = buildThemePayload(videoConfig?.theme, config?.theme);
    sendToIframe(iframeRef, "webreel:init", {
      ...themePayload,
      viewport: { width: vpWidth, height: vpHeight },
      colorScheme: effectiveColorScheme,
    });
  }, [
    iframeReady,
    pickMode,
    videoConfig?.theme,
    config?.theme,
    vpWidth,
    vpHeight,
    effectiveColorScheme,
  ]);

  useEffect(() => {
    if (!iframeReady) return;
    sendToIframe(iframeRef, "webreel:colorScheme", { value: effectiveColorScheme });
  }, [iframeReady, effectiveColorScheme]);

  const copySelector = useCallback(() => {
    if (!pickedSelector) return;
    navigator.clipboard.writeText(pickedSelector).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [pickedSelector]);

  const dismissSelector = useCallback(() => {
    setPickedSelector(null);
    setCopied(false);
  }, [setPickedSelector]);

  useEffect(() => {
    if (renderStatus === "done" && lastRenderOutput) {
      setCanvasMode("playback");
    }
  }, [renderStatus, lastRenderOutput]);

  useEffect(() => {
    if (canvasMode === "playback" && videoRef.current && lastRenderOutput) {
      videoRef.current.play().catch(() => {
        // autoplay blocked by browser
      });
    }
  }, [canvasMode, lastRenderOutput]);

  const toggleVideoPlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }, []);

  const videoSeekTo = useCallback((t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      setVideoCurrentTime(t);
    }
  }, []);

  const videoFrameStep = useCallback((frames: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, Math.min(v.currentTime + frames / 60, v.duration || 0));
  }, []);

  const videoSrc = lastRenderOutput
    ? `/api/video?path=${encodeURIComponent(lastRenderOutput)}`
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {canvasMode === "playback" ? "Playback" : "Canvas"}
        </span>
        {videoConfig && resolvedUrl && (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
              <Globe className="size-3" />
              <span className="max-w-[200px] truncate">{resolvedUrl}</span>
              <span>
                {vpWidth}x{vpHeight}
                {hasChrome && ` @ ${canvasW}x${canvasH}`}
              </span>
            </div>

            {canvasMode === "playback" ? (
              <>
                {videoSrc && (
                  <Button variant="ghost" size="icon-xs" asChild>
                    <a href={videoSrc} download title="Download">
                      <Download className="size-3" />
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setCanvasMode("preview")}
                  className="gap-1"
                >
                  <X className="size-3" />
                  Close
                </Button>
              </>
            ) : (
              <>
                {isLoadable && (
                  <Button
                    variant={pickMode ? "default" : "ghost"}
                    size="icon-xs"
                    onClick={togglePickMode}
                    title={pickMode ? "Cancel picker" : "Pick element"}
                    className={cn(pickMode && "bg-blue-600 text-white hover:bg-blue-700")}
                  >
                    <Crosshair className="size-3" />
                  </Button>
                )}
                {renderStatus === "running" ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={stopRender}
                    className="gap-1 text-destructive"
                  >
                    <Square className="size-3" />
                    Stop
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="xs" className="gap-1">
                        <Play className="size-3" />
                        Record
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onSelect={() => startRender()}>
                        <Play className="size-3.5" />
                        Record current
                        {selectedVideo && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {selectedVideo}
                          </span>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => startRender(videoNames)}
                        disabled={videoNames.length <= 1}
                      >
                        <Film className="size-3.5" />
                        Record all ({videoNames.length})
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {renderStatus === "done" && lastRenderOutput && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setCanvasMode("playback")}
                    className="gap-1"
                  >
                    <Film className="size-3" />
                    Play
                  </Button>
                )}
                {isLoadable && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={reload}
                      title="Reload"
                    >
                      <RefreshCw className="size-3" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" asChild>
                      <a
                        href={resolvedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in new tab"
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {canvasMode === "preview" && pickedSelector && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-1.5">
          <code className="min-w-0 flex-1 truncate text-[11px] text-foreground">
            {pickedSelector}
          </code>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={copySelector}
            title="Copy selector"
          >
            <Copy className="size-3" />
          </Button>
          {copied && <span className="text-[10px] text-success">Copied</span>}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={dismissSelector}
            title="Dismiss"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {canvasMode === "preview" && pickMode && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-blue-600/10 px-3 py-1">
          <Crosshair className="size-3 text-blue-400" />
          <span className="text-[11px] text-blue-400">
            Click an element in the page to get its selector
          </span>
        </div>
      )}

      {canvasMode === "preview" && (
        <SimulationControls
          onPlay={startSimulation}
          onStop={stopSimulation}
          onStepForward={simulateOneStep}
          iframeReady={iframeReady && !pickMode}
          replaying={replayState.status === "replaying"}
          replayProgress={
            replayState.status === "replaying" ? replayState.currentStep : undefined
          }
          replayTarget={
            replayState.status === "replaying" ? replayState.targetStep : undefined
          }
        />
      )}

      <div className="h-px shrink-0 bg-border" />
      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={showConsole ? 70 : 100} minSize={30}>
          <div
            ref={containerRef}
            className="relative flex h-full items-center justify-center overflow-hidden bg-card/50"
            style={
              canvasMode === "preview" && videoConfig && iframeSrc
                ? { cursor: previewCursor }
                : undefined
            }
          >
            {canvasMode === "playback" && videoSrc ? (
              <div
                className="group relative overflow-hidden rounded-lg shadow-lg"
                style={{
                  width: canvasW * scale,
                  height: canvasH * scale,
                }}
              >
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="h-full w-full bg-black"
                  onTimeUpdate={() =>
                    setVideoCurrentTime(videoRef.current?.currentTime ?? 0)
                  }
                  onLoadedMetadata={() =>
                    setVideoDuration(videoRef.current?.duration ?? 0)
                  }
                  onEnded={() => setVideoPlaying(false)}
                  onPlay={() => setVideoPlaying(true)}
                  onPause={() => setVideoPlaying(false)}
                  onClick={toggleVideoPlay}
                />
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-linear-to-t from-black/70 via-black/40 to-transparent px-3 pb-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100">
                  <div
                    className="relative h-1 w-full cursor-pointer rounded-full bg-white/25"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = (e.clientX - rect.left) / rect.width;
                      videoSeekTo(pct * videoDuration);
                    }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-100"
                      style={{
                        width: `${(videoCurrentTime / (videoDuration || 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        videoFrameStep(-1);
                      }}
                      className="text-white hover:bg-white/20 hover:text-white"
                      title="Previous frame"
                    >
                      <SkipBack className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVideoPlay();
                      }}
                      className="text-white hover:bg-white/20 hover:text-white"
                    >
                      {videoPlaying ? (
                        <Pause className="size-3" />
                      ) : (
                        <Play className="size-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        videoFrameStep(1);
                      }}
                      className="text-white hover:bg-white/20 hover:text-white"
                      title="Next frame"
                    >
                      <SkipForward className="size-3" />
                    </Button>
                    <span className="text-[10px] tabular-nums text-white/80">
                      {formatElapsed(Math.floor(videoCurrentTime))} /{" "}
                      {formatElapsed(Math.floor(videoDuration))}
                    </span>
                  </div>
                </div>
              </div>
            ) : videoConfig && iframeSrc ? (
              hasChrome ? (
                <PreviewWithChrome
                  canvasW={canvasW}
                  canvasH={canvasH}
                  vpWidth={vpWidth}
                  vpHeight={vpHeight}
                  scale={scale}
                  titlebarH={titlebarH}
                  titlebarVisible={titlebarVisible}
                  borderRadius={borderRadius}
                  windowCfg={windowCfg}
                  backgroundCfg={backgroundCfg}
                  iframeKey={iframeKey}
                  iframeRef={iframeRef}
                  iframeSrc={iframeSrc}
                  selectedVideo={selectedVideo}
                  pickMode={pickMode}
                  previewCursor={previewCursor}
                />
              ) : (
                <div
                  className={cn(
                    "relative overflow-hidden rounded-lg border bg-background shadow-sm",
                    pickMode && "ring-2 ring-blue-500/50",
                  )}
                  style={{
                    width: vpWidth * scale,
                    height: vpHeight * scale,
                    cursor: previewCursor,
                  }}
                >
                  <iframe
                    key={iframeKey}
                    ref={iframeRef}
                    src={iframeSrc}
                    title={`Preview: ${selectedVideo}`}
                    style={{
                      width: vpWidth,
                      height: vpHeight,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                    }}
                    className="border-0"
                  />
                </div>
              )
            ) : videoConfig ? (
              <div className="space-y-2 text-center">
                <Globe className="mx-auto size-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground/60">
                  Cannot preview this URL
                </p>
                <p className="max-w-[300px] text-[10px] text-muted-foreground/40">
                  Set the URL to an http:// or https:// address to see a live preview.
                  Relative or file:// URLs require running{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    webreel preview {selectedVideo}
                  </code>
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Select a video to preview</p>
            )}

            {renderStatus === "running" && canvasMode === "preview" && (
              <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
                <span className="size-2 animate-pulse rounded-full bg-red-500" />
                <span className="text-xs font-medium text-white">
                  REC {formatElapsed(recordingElapsed)}
                </span>
              </div>
            )}
          </div>
        </ResizablePanel>
        {showConsole && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize={30} minSize={10} maxSize={60}>
              <RenderConsole />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
