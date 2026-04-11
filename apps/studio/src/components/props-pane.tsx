"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai/react";
import {
  configJsonAtom,
  parsedConfigAtom,
  selectedVideoAtom,
  selectedStepIndexAtom,
  selectedVideoConfigAtom,
  pickedSelectorAtom,
  commitConfigAtom,
  VIEWPORT_PRESETS,
} from "@/store/config";
import type { Step, VideoConfig, WindowConfig } from "@/store/config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ThemeEditor } from "@/components/theme-editor";
import { SfxConfigEditor } from "@/components/sfx-config";
import { IncludeManager } from "@/components/include-manager";
import { useCallback, useEffect, useRef, useState } from "react";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function useConfigMutation() {
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const commit = useSetAtom(commitConfigAtom);

  const mutate = useCallback(
    (updater: (draft: Record<string, unknown>) => void) => {
      if (!config) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      updater(draft);
      commit(JSON.stringify(draft, null, 2));
    },
    [config, configJson, commit],
  );

  return mutate;
}

// ─── Viewport preset helpers ────────────────────────────────────────────────

function getPresetKey(width: number, height: number): string | null {
  for (const [key, preset] of Object.entries(VIEWPORT_PRESETS)) {
    if (preset.width === width && preset.height === height) return key;
  }
  return null;
}

// ─── Video Settings ─────────────────────────────────────────────────────────

function VideoSettingsForm({ videoConfig }: { videoConfig: VideoConfig }) {
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const mutate = useConfigMutation();

  const updateField = useCallback(
    (field: string, value: unknown) => {
      if (!selectedVideo) return;
      mutate((draft) => {
        const videos = draft.videos as Record<string, Record<string, unknown>>;
        if (videos[selectedVideo]) {
          if (value === "" || value === undefined) {
            delete videos[selectedVideo][field];
          } else {
            videos[selectedVideo][field] = value;
          }
        }
      });
    },
    [mutate, selectedVideo],
  );

  const updateViewport = useCallback(
    (dim: "width" | "height", value: string) => {
      if (!selectedVideo) return;
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      mutate((draft) => {
        const videos = draft.videos as Record<string, Record<string, unknown>>;
        const video = videos[selectedVideo];
        if (!video) return;
        const vp = (video.viewport as Record<string, number>) ?? {
          width: 1920,
          height: 1080,
        };
        vp[dim] = num;
        video.viewport = vp;
      });
    },
    [mutate, selectedVideo],
  );

  const setPreset = useCallback(
    (presetKey: string) => {
      if (!selectedVideo || presetKey === "custom") return;
      const preset = VIEWPORT_PRESETS[presetKey];
      if (!preset) return;
      mutate((draft) => {
        const videos = draft.videos as Record<string, Record<string, unknown>>;
        const video = videos[selectedVideo];
        if (!video) return;
        video.viewport = { width: preset.width, height: preset.height };
      });
    },
    [mutate, selectedVideo],
  );

  const vpWidth =
    typeof videoConfig.viewport === "object"
      ? (videoConfig.viewport?.width ?? 1920)
      : 1920;
  const vpHeight =
    typeof videoConfig.viewport === "object"
      ? (videoConfig.viewport?.height ?? 1080)
      : 1080;
  const currentPreset = getPresetKey(vpWidth, vpHeight);

  const outputExt =
    videoConfig.output?.match(/\.(mp4|gif|webm)$/i)?.[1]?.toLowerCase() ?? "mp4";

  const setOutputFormat = useCallback(
    (format: string) => {
      const currentOutput = videoConfig.output ?? "";
      const base = currentOutput.replace(/\.(mp4|gif|webm)$/i, "");
      updateField("output", base ? `${base}.${format}` : undefined);
    },
    [videoConfig.output, updateField],
  );

  const waitForValue =
    typeof videoConfig.waitFor === "string"
      ? videoConfig.waitFor
      : typeof videoConfig.waitFor === "object"
        ? ((videoConfig.waitFor as { selector?: string }).selector ?? "")
        : "";

  return (
    <div className="space-y-3 p-3">
      <FieldRow label="URL">
        <Input
          className="h-7 text-xs"
          value={videoConfig.url}
          onChange={(e) => updateField("url", e.target.value)}
        />
      </FieldRow>
      <FieldRow label="Base URL">
        <Input
          className="h-7 text-xs"
          value={videoConfig.baseUrl ?? ""}
          placeholder="Optional"
          onChange={(e) => updateField("baseUrl", e.target.value)}
        />
      </FieldRow>

      <div className="my-2 h-px bg-border" />
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Viewport
      </h4>

      <FieldRow label="Preset">
        <Select value={currentPreset ?? "custom"} onValueChange={setPreset}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">Custom</SelectItem>
            {Object.entries(VIEWPORT_PRESETS).map(([key, preset]) => (
              <SelectItem key={key} value={key}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Width">
        <Input
          className="h-7 text-xs"
          type="number"
          value={vpWidth}
          onChange={(e) => updateViewport("width", e.target.value)}
        />
      </FieldRow>
      <FieldRow label="Height">
        <Input
          className="h-7 text-xs"
          type="number"
          value={vpHeight}
          onChange={(e) => updateViewport("height", e.target.value)}
        />
      </FieldRow>
      <FieldRow label="Zoom">
        <Input
          className="h-7 text-xs"
          type="number"
          step="0.5"
          min="0.5"
          max="4"
          value={videoConfig.zoom ?? ""}
          placeholder="1"
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            updateField("zoom", isNaN(v) ? undefined : v);
          }}
        />
      </FieldRow>

      <ScreenSizeSection videoConfig={videoConfig} updateField={updateField} />
      <BackgroundSection videoConfig={videoConfig} />
      <WindowSection videoConfig={videoConfig} />

      <div className="my-2 h-px bg-border" />
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Recording
      </h4>

      <FieldRow label="FPS">
        <Input
          className="h-7 text-xs"
          type="number"
          value={videoConfig.fps ?? ""}
          placeholder="60"
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            updateField("fps", isNaN(v) ? undefined : v);
          }}
        />
      </FieldRow>
      <FieldRow label="Quality">
        <div className="flex items-center gap-2">
          <Slider
            min={1}
            max={100}
            step={1}
            value={[videoConfig.quality ?? 80]}
            onValueChange={([v]) => updateField("quality", v)}
            className="flex-1"
          />
          <span className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">
            {videoConfig.quality ?? 80}
          </span>
        </div>
      </FieldRow>
      <FieldRow label="Color Scheme">
        <Select
          value={videoConfig.colorScheme ?? "auto"}
          onValueChange={(v) => updateField("colorScheme", v === "auto" ? undefined : v)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (match Studio)</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      <div className="my-2 h-px bg-border" />
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Output
      </h4>

      <FieldRow label="Format">
        <Select value={outputExt} onValueChange={setOutputFormat}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mp4">MP4 (H.264)</SelectItem>
            <SelectItem value="webm">WebM (VP9)</SelectItem>
            <SelectItem value="gif">GIF</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Output Path">
        <Input
          className="h-7 text-xs"
          value={videoConfig.output ?? ""}
          placeholder="Auto"
          onChange={(e) => updateField("output", e.target.value)}
        />
      </FieldRow>

      <div className="my-2 h-px bg-border" />
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Thumbnail
      </h4>

      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">Enabled</Label>
        <Switch
          checked={videoConfig.thumbnail?.enabled !== false}
          onCheckedChange={(v) => {
            mutate((draft) => {
              if (!selectedVideo) return;
              const videos = draft.videos as Record<string, Record<string, unknown>>;
              const video = videos[selectedVideo];
              if (!video) return;
              const t = (video.thumbnail as Record<string, unknown>) ?? {};
              t.enabled = v;
              video.thumbnail = t;
            });
          }}
        />
      </div>
      <FieldRow label="Time (s)">
        <Input
          className="h-7 text-xs"
          type="number"
          step="0.1"
          min="0"
          value={videoConfig.thumbnail?.time ?? ""}
          placeholder="0"
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            mutate((draft) => {
              if (!selectedVideo) return;
              const videos = draft.videos as Record<string, Record<string, unknown>>;
              const video = videos[selectedVideo];
              if (!video) return;
              const t = (video.thumbnail as Record<string, unknown>) ?? {};
              if (isNaN(v)) {
                delete t.time;
              } else {
                t.time = v;
              }
              video.thumbnail = t;
            });
          }}
        />
      </FieldRow>

      <div className="my-2 h-px bg-border" />
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Advanced
      </h4>

      <FieldRow label="Wait For">
        <Input
          className="h-7 text-xs"
          value={waitForValue}
          placeholder="CSS selector"
          onChange={(e) => updateField("waitFor", e.target.value || undefined)}
        />
      </FieldRow>
      <FieldRow label="Default Delay">
        <Input
          className="h-7 text-xs"
          type="number"
          value={videoConfig.defaultDelay ?? ""}
          placeholder="0 ms"
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            updateField("defaultDelay", isNaN(v) ? undefined : v);
          }}
        />
      </FieldRow>
      <FieldRow label="Click Dwell">
        <Input
          className="h-7 text-xs"
          type="number"
          value={videoConfig.clickDwell ?? ""}
          placeholder="80-180 ms"
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            updateField("clickDwell", isNaN(v) ? undefined : v);
          }}
        />
      </FieldRow>
    </div>
  );
}

// ─── Screen Size ─────────────────────────────────────────────────────────────

const SCREEN_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  "1080p": { width: 1920, height: 1080, label: "1080p (1920x1080)" },
  "1440p": { width: 2560, height: 1440, label: "1440p (2560x1440)" },
  "4k": { width: 3840, height: 2160, label: "4K (3840x2160)" },
  "720p": { width: 1280, height: 720, label: "720p (1280x720)" },
  square: { width: 1080, height: 1080, label: "Square (1080x1080)" },
  "portrait-9:16": { width: 1080, height: 1920, label: "Portrait 9:16 (1080x1920)" },
};

function getScreenPresetKey(w: number, h: number): string | null {
  for (const [key, preset] of Object.entries(SCREEN_PRESETS)) {
    if (preset.width === w && preset.height === h) return key;
  }
  return null;
}

function ScreenSizeSection({
  videoConfig,
  updateField,
}: {
  videoConfig: VideoConfig;
  updateField: (field: string, value: unknown) => void;
}) {
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const mutate = useConfigMutation();

  const screenEnabled = !!videoConfig.screen;
  const screenW = videoConfig.screen?.width ?? 1920;
  const screenH = videoConfig.screen?.height ?? 1080;
  const screenPreset = screenEnabled ? getScreenPresetKey(screenW, screenH) : null;

  const updateScreen = useCallback(
    (dim: "width" | "height", value: string) => {
      if (!selectedVideo) return;
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      mutate((draft) => {
        const videos = draft.videos as Record<string, Record<string, unknown>>;
        const video = videos[selectedVideo];
        if (!video) return;
        const sc = (video.screen as Record<string, number>) ?? {
          width: 1920,
          height: 1080,
        };
        sc[dim] = num;
        video.screen = sc;
      });
    },
    [mutate, selectedVideo],
  );

  const setScreenPreset = useCallback(
    (presetKey: string) => {
      if (!selectedVideo || presetKey === "custom") return;
      const preset = SCREEN_PRESETS[presetKey];
      if (!preset) return;
      mutate((draft) => {
        const videos = draft.videos as Record<string, Record<string, unknown>>;
        const video = videos[selectedVideo];
        if (!video) return;
        video.screen = { width: preset.width, height: preset.height };
      });
    },
    [mutate, selectedVideo],
  );

  return (
    <>
      <div className="my-2 h-px bg-border" />
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Screen Size
      </h4>

      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">Enable</Label>
        <Switch
          checked={screenEnabled}
          onCheckedChange={(v) => {
            if (v) {
              updateField("screen", { width: 1920, height: 1080 });
            } else {
              updateField("screen", undefined);
              updateField("window", undefined);
              updateField("background", undefined);
            }
          }}
        />
      </div>

      {screenEnabled && (
        <>
          <FieldRow label="Preset">
            <Select value={screenPreset ?? "custom"} onValueChange={setScreenPreset}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                {Object.entries(SCREEN_PRESETS).map(([key, preset]) => (
                  <SelectItem key={key} value={key}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Width">
            <Input
              className="h-7 text-xs"
              type="number"
              value={screenW}
              onChange={(e) => updateScreen("width", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Height">
            <Input
              className="h-7 text-xs"
              type="number"
              value={screenH}
              onChange={(e) => updateScreen("height", e.target.value)}
            />
          </FieldRow>
        </>
      )}
    </>
  );
}

// ─── Background ──────────────────────────────────────────────────────────────

function BackgroundSection({ videoConfig }: { videoConfig: VideoConfig }) {
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const mutate = useConfigMutation();

  const updateBg = useCallback(
    (updater: (draft: Record<string, unknown>) => void) => {
      if (!selectedVideo) return;
      mutate((d) => {
        const videos = d.videos as Record<string, Record<string, unknown>>;
        const video = videos[selectedVideo];
        if (!video) return;
        const current = (video.background as Record<string, unknown>) ?? {
          type: "solid",
          color: "#e0e0e0",
        };
        updater(current);
        video.background = current;
      });
    },
    [mutate, selectedVideo],
  );

  if (!videoConfig.screen) return null;

  const bg = videoConfig.background ?? { type: "solid" as const, color: "#e0e0e0" };
  const bgType = bg.type ?? "solid";

  return (
    <>
      <div className="my-2 h-px bg-border" />
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Background
      </h4>

      <FieldRow label="Type">
        <Select
          value={bgType}
          onValueChange={(v) =>
            updateBg((d) => {
              d.type = v;
            })
          }
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="gradient">Gradient</SelectItem>
            <SelectItem value="image">Image</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      {bgType === "solid" && (
        <FieldRow label="Color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bg.color ?? "#e0e0e0"}
              onChange={(e) =>
                updateBg((d) => {
                  d.color = e.target.value;
                })
              }
              className="h-7 w-7 shrink-0 cursor-pointer rounded border bg-transparent"
            />
            <Input
              className="h-7 text-xs"
              value={bg.color ?? "#e0e0e0"}
              onChange={(e) =>
                updateBg((d) => {
                  d.color = e.target.value;
                })
              }
            />
          </div>
        </FieldRow>
      )}

      {bgType === "gradient" && (
        <>
          <FieldRow label="From">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={bg.gradient?.from ?? "#667eea"}
                onChange={(e) =>
                  updateBg((d) => {
                    const g = (d.gradient as Record<string, unknown>) ?? {
                      from: "#667eea",
                      to: "#764ba2",
                    };
                    g.from = e.target.value;
                    d.gradient = g;
                  })
                }
                className="h-7 w-7 shrink-0 cursor-pointer rounded border bg-transparent"
              />
              <Input
                className="h-7 text-xs"
                value={bg.gradient?.from ?? "#667eea"}
                onChange={(e) =>
                  updateBg((d) => {
                    const g = (d.gradient as Record<string, unknown>) ?? {
                      from: "#667eea",
                      to: "#764ba2",
                    };
                    g.from = e.target.value;
                    d.gradient = g;
                  })
                }
              />
            </div>
          </FieldRow>
          <FieldRow label="To">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={bg.gradient?.to ?? "#764ba2"}
                onChange={(e) =>
                  updateBg((d) => {
                    const g = (d.gradient as Record<string, unknown>) ?? {
                      from: "#667eea",
                      to: "#764ba2",
                    };
                    g.to = e.target.value;
                    d.gradient = g;
                  })
                }
                className="h-7 w-7 shrink-0 cursor-pointer rounded border bg-transparent"
              />
              <Input
                className="h-7 text-xs"
                value={bg.gradient?.to ?? "#764ba2"}
                onChange={(e) =>
                  updateBg((d) => {
                    const g = (d.gradient as Record<string, unknown>) ?? {
                      from: "#667eea",
                      to: "#764ba2",
                    };
                    g.to = e.target.value;
                    d.gradient = g;
                  })
                }
              />
            </div>
          </FieldRow>
          <FieldRow label="Angle">
            <div className="flex items-center gap-2">
              <Slider
                min={0}
                max={360}
                step={1}
                value={[bg.gradient?.angle ?? 180]}
                onValueChange={([v]) =>
                  updateBg((d) => {
                    const g = (d.gradient as Record<string, unknown>) ?? {
                      from: "#667eea",
                      to: "#764ba2",
                    };
                    g.angle = v;
                    d.gradient = g;
                  })
                }
                className="flex-1"
              />
              <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                {bg.gradient?.angle ?? 180}
              </span>
            </div>
          </FieldRow>
        </>
      )}

      {bgType === "image" && (
        <FieldRow label="URL">
          <Input
            className="h-7 text-xs"
            value={bg.image ?? ""}
            placeholder="Image path or URL"
            onChange={(e) =>
              updateBg((d) => {
                d.image = e.target.value;
              })
            }
          />
        </FieldRow>
      )}
    </>
  );
}

// ─── Window ──────────────────────────────────────────────────────────────────

function WindowSection({ videoConfig }: { videoConfig: VideoConfig }) {
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const mutate = useConfigMutation();

  const updateWindow = useCallback(
    (updater: (draft: Record<string, unknown>) => void) => {
      if (!selectedVideo) return;
      mutate((d) => {
        const videos = d.videos as Record<string, Record<string, unknown>>;
        const video = videos[selectedVideo];
        if (!video) return;
        const current = (video.window as Record<string, unknown>) ?? {};
        updater(current);
        video.window = current;
      });
    },
    [mutate, selectedVideo],
  );

  const updateTitlebar = useCallback(
    (field: string, value: unknown) => {
      updateWindow((w) => {
        const tb = (w.titlebar as Record<string, unknown>) ?? {};
        if (value === undefined || value === "") {
          delete tb[field];
        } else {
          tb[field] = value;
        }
        w.titlebar = tb;
      });
    },
    [updateWindow],
  );

  if (!videoConfig.screen) return null;

  const wc = videoConfig.window ?? ({} as WindowConfig);
  const titlebarVisible = wc.titlebar?.visible ?? false;

  const shadowEnabled = wc.shadow !== undefined && wc.shadow !== false;
  const shadowObj =
    typeof wc.shadow === "object" ? wc.shadow : shadowEnabled ? {} : undefined;

  return (
    <>
      <div className="my-2 h-px bg-border" />
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Window
      </h4>

      <FieldRow label="Radius">
        <div className="flex items-center gap-2">
          <Slider
            min={0}
            max={32}
            step={1}
            value={[wc.borderRadius ?? (titlebarVisible ? 10 : 0)]}
            onValueChange={([v]) =>
              updateWindow((w) => {
                w.borderRadius = v;
              })
            }
            className="flex-1"
          />
          <span className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">
            {wc.borderRadius ?? (titlebarVisible ? 10 : 0)}
          </span>
        </div>
      </FieldRow>

      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">Shadow</Label>
        <Switch
          checked={shadowEnabled}
          onCheckedChange={(v) => {
            if (v) {
              updateWindow((w) => {
                w.shadow = { blur: 40, color: "rgba(0,0,0,0.35)", offsetY: 10 };
              });
            } else {
              updateWindow((w) => {
                delete w.shadow;
              });
            }
          }}
        />
      </div>

      {shadowEnabled && shadowObj && (
        <>
          <FieldRow label="Blur">
            <div className="flex items-center gap-2">
              <Slider
                min={0}
                max={100}
                step={1}
                value={[typeof shadowObj === "object" ? (shadowObj.blur ?? 40) : 40]}
                onValueChange={([v]) =>
                  updateWindow((w) => {
                    const s = (w.shadow as Record<string, unknown>) ?? {};
                    s.blur = v;
                    w.shadow = s;
                  })
                }
                className="flex-1"
              />
              <span className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">
                {typeof shadowObj === "object" ? (shadowObj.blur ?? 40) : 40}
              </span>
            </div>
          </FieldRow>
          <FieldRow label="Offset Y">
            <Input
              className="h-7 text-xs"
              type="number"
              value={typeof shadowObj === "object" ? (shadowObj.offsetY ?? 10) : 10}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                updateWindow((w) => {
                  const s = (w.shadow as Record<string, unknown>) ?? {};
                  s.offsetY = isNaN(v) ? 10 : v;
                  w.shadow = s;
                });
              }}
            />
          </FieldRow>
          <FieldRow label="Color">
            <Input
              className="h-7 text-xs"
              value={
                typeof shadowObj === "object"
                  ? (shadowObj.color ?? "rgba(0,0,0,0.35)")
                  : "rgba(0,0,0,0.35)"
              }
              onChange={(e) =>
                updateWindow((w) => {
                  const s = (w.shadow as Record<string, unknown>) ?? {};
                  s.color = e.target.value;
                  w.shadow = s;
                })
              }
            />
          </FieldRow>
        </>
      )}

      <div className="my-2 h-px bg-border/50" />
      <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Titlebar
      </h4>

      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">Visible</Label>
        <Switch
          checked={titlebarVisible}
          onCheckedChange={(v) => updateTitlebar("visible", v)}
        />
      </div>

      {titlebarVisible && (
        <>
          <FieldRow label="Title">
            <Input
              className="h-7 text-xs"
              value={wc.titlebar?.title ?? ""}
              placeholder="Window title"
              onChange={(e) => updateTitlebar("title", e.target.value || undefined)}
            />
          </FieldRow>
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground">Stoplight</Label>
            <Switch
              checked={wc.titlebar?.stoplight !== false}
              onCheckedChange={(v) => updateTitlebar("stoplight", v)}
            />
          </div>
          <FieldRow label="Height">
            <Input
              className="h-7 text-xs"
              type="number"
              value={wc.titlebar?.height ?? 36}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                updateTitlebar("height", isNaN(v) ? 36 : v);
              }}
            />
          </FieldRow>
          <FieldRow label="Background">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={wc.titlebar?.background ?? "#e8e8e8"}
                onChange={(e) => updateTitlebar("background", e.target.value)}
                className="h-7 w-7 shrink-0 cursor-pointer rounded border bg-transparent"
              />
              <Input
                className="h-7 text-xs"
                value={wc.titlebar?.background ?? "#e8e8e8"}
                onChange={(e) => updateTitlebar("background", e.target.value)}
              />
            </div>
          </FieldRow>
        </>
      )}

      <FieldRow label="Position">
        <Select
          value={
            typeof wc.position === "object" && "x" in wc.position ? "custom" : "center"
          }
          onValueChange={(v) => {
            if (v === "center") {
              updateWindow((w) => {
                w.position = "center";
              });
            } else {
              updateWindow((w) => {
                w.position = { x: 0, y: 0 };
              });
            }
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      {typeof wc.position === "object" && "x" in wc.position && (
        <>
          <FieldRow label="X">
            <Input
              className="h-7 text-xs"
              type="number"
              value={wc.position.x}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                updateWindow((w) => {
                  const pos = (w.position as Record<string, number>) ?? { x: 0, y: 0 };
                  pos.x = isNaN(v) ? 0 : v;
                  w.position = pos;
                });
              }}
            />
          </FieldRow>
          <FieldRow label="Y">
            <Input
              className="h-7 text-xs"
              type="number"
              value={wc.position.y}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                updateWindow((w) => {
                  const pos = (w.position as Record<string, number>) ?? { x: 0, y: 0 };
                  pos.y = isNaN(v) ? 0 : v;
                  w.position = pos;
                });
              }}
            />
          </FieldRow>
        </>
      )}
    </>
  );
}

// ─── Step Properties ────────────────────────────────────────────────────────

const ACTION_TYPES = [
  "pause",
  "click",
  "type",
  "key",
  "scroll",
  "wait",
  "moveTo",
  "navigate",
  "screenshot",
  "hover",
  "drag",
  "select",
] as const;

const MODIFIERS = ["Ctrl", "Shift", "Alt", "Meta"] as const;

function ElementTargetFields({
  prefix,
  step,
  updateStepField,
}: {
  prefix: string;
  step: Step;
  updateStepField: (field: string, value: unknown) => void;
}) {
  const target = (step[prefix] as Record<string, unknown>) ?? {};
  const update = useCallback(
    (field: string, value: unknown) => {
      const t = { ...((step[prefix] as Record<string, unknown>) ?? {}) };
      if (value === "" || value === undefined) {
        delete t[field];
      } else {
        t[field] = value;
      }
      updateStepField(prefix, Object.keys(t).length > 0 ? t : undefined);
    },
    [step, prefix, updateStepField],
  );

  return (
    <>
      <FieldRow label={`${prefix}.selector`}>
        <Input
          className="h-7 text-xs"
          value={(target.selector as string) ?? ""}
          placeholder="CSS selector"
          onChange={(e) => update("selector", e.target.value)}
        />
      </FieldRow>
      <FieldRow label={`${prefix}.text`}>
        <Input
          className="h-7 text-xs"
          value={(target.text as string) ?? ""}
          placeholder="Text match"
          onChange={(e) => update("text", e.target.value)}
        />
      </FieldRow>
      <FieldRow label={`${prefix}.within`}>
        <Input
          className="h-7 text-xs"
          value={(target.within as string) ?? ""}
          placeholder="Scope"
          onChange={(e) => update("within", e.target.value)}
        />
      </FieldRow>
    </>
  );
}

function StepPropertiesForm({ step, stepIndex }: { step: Step; stepIndex: number }) {
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const mutate = useConfigMutation();

  const updateStepField = useCallback(
    (field: string, value: unknown) => {
      if (!selectedVideo) return;
      mutate((draft) => {
        const videos = draft.videos as Record<string, Record<string, unknown>>;
        const video = videos[selectedVideo];
        if (!video) return;
        const steps = video.steps as Record<string, unknown>[];
        if (!steps[stepIndex]) return;
        if (value === "" || value === undefined) {
          delete steps[stepIndex][field];
        } else {
          steps[stepIndex][field] = value;
        }
      });
    },
    [mutate, selectedVideo, stepIndex],
  );

  const updateAction = useCallback(
    (newAction: string) => {
      if (!selectedVideo) return;
      mutate((draft) => {
        const videos = draft.videos as Record<string, Record<string, unknown>>;
        const video = videos[selectedVideo];
        if (!video) return;
        const steps = video.steps as Record<string, unknown>[];
        if (!steps[stepIndex]) return;
        steps[stepIndex] = { action: newAction };
      });
    },
    [mutate, selectedVideo, stepIndex],
  );

  const modifiers = (step.modifiers as string[]) ?? [];

  const toggleModifier = useCallback(
    (mod: string, checked: boolean) => {
      const current = (step.modifiers as string[]) ?? [];
      const next = checked ? [...current, mod] : current.filter((m: string) => m !== mod);
      updateStepField("modifiers", next.length > 0 ? next : undefined);
    },
    [step.modifiers, updateStepField],
  );

  return (
    <div className="space-y-3 p-3">
      <FieldRow label="Action">
        <Select value={step.action} onValueChange={updateAction}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {step.action === "pause" && (
        <FieldRow label="Duration">
          <Input
            className="h-7 text-xs"
            type="number"
            value={(step.ms as number) ?? ""}
            placeholder="ms"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              updateStepField("ms", isNaN(v) ? undefined : v);
            }}
          />
        </FieldRow>
      )}

      {(step.action === "click" ||
        step.action === "hover" ||
        step.action === "wait" ||
        step.action === "scroll" ||
        step.action === "moveTo" ||
        step.action === "select") && (
        <>
          <FieldRow label="Selector">
            <Input
              className="h-7 text-xs"
              value={(step.selector as string) ?? ""}
              placeholder="CSS selector"
              onChange={(e) => updateStepField("selector", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Text">
            <Input
              className="h-7 text-xs"
              value={(step.text as string) ?? ""}
              placeholder="Text match"
              onChange={(e) => updateStepField("text", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Within">
            <Input
              className="h-7 text-xs"
              value={(step.within as string) ?? ""}
              placeholder="Scope selector"
              onChange={(e) => updateStepField("within", e.target.value)}
            />
          </FieldRow>
        </>
      )}

      {step.action === "click" && (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Modifiers</Label>
          <div className="flex flex-wrap gap-3">
            {MODIFIERS.map((mod) => (
              <label key={mod} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={modifiers.includes(mod)}
                  onCheckedChange={(v) => toggleModifier(mod, !!v)}
                />
                {mod}
              </label>
            ))}
          </div>
        </div>
      )}

      {step.action === "select" && (
        <FieldRow label="Value">
          <Input
            className="h-7 text-xs"
            value={(step.value as string) ?? ""}
            placeholder="Option value"
            onChange={(e) => updateStepField("value", e.target.value)}
          />
        </FieldRow>
      )}

      {step.action === "type" && (
        <>
          <FieldRow label="Text">
            <Input
              className="h-7 text-xs"
              value={(step.text as string) ?? ""}
              onChange={(e) => updateStepField("text", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Selector">
            <Input
              className="h-7 text-xs"
              value={(step.selector as string) ?? ""}
              placeholder="CSS selector"
              onChange={(e) => updateStepField("selector", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Within">
            <Input
              className="h-7 text-xs"
              value={(step.within as string) ?? ""}
              placeholder="Scope selector"
              onChange={(e) => updateStepField("within", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Char Delay">
            <Input
              className="h-7 text-xs"
              type="number"
              value={(step.charDelay as number) ?? ""}
              placeholder="120 ms"
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                updateStepField("charDelay", isNaN(v) ? undefined : v);
              }}
            />
          </FieldRow>
        </>
      )}

      {step.action === "key" && (
        <>
          <FieldRow label="Key">
            <Input
              className="h-7 text-xs"
              value={(step.key as string) ?? ""}
              placeholder="e.g. Enter, Tab"
              onChange={(e) => updateStepField("key", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Target">
            <Input
              className="h-7 text-xs"
              value={
                typeof step.target === "string"
                  ? step.target
                  : (((step.target as Record<string, unknown>)?.selector as string) ?? "")
              }
              placeholder="CSS selector (optional)"
              onChange={(e) => updateStepField("target", e.target.value || undefined)}
            />
          </FieldRow>
        </>
      )}

      {step.action === "navigate" && (
        <FieldRow label="URL">
          <Input
            className="h-7 text-xs"
            value={(step.url as string) ?? ""}
            onChange={(e) => updateStepField("url", e.target.value)}
          />
        </FieldRow>
      )}

      {step.action === "screenshot" && (
        <FieldRow label="Output">
          <Input
            className="h-7 text-xs"
            value={(step.output as string) ?? ""}
            placeholder="screenshot.png"
            onChange={(e) => updateStepField("output", e.target.value)}
          />
        </FieldRow>
      )}

      {step.action === "scroll" && (
        <>
          <FieldRow label="X offset">
            <Input
              className="h-7 text-xs"
              type="number"
              value={(step.x as number) ?? ""}
              placeholder="0"
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                updateStepField("x", isNaN(v) ? undefined : v);
              }}
            />
          </FieldRow>
          <FieldRow label="Y offset">
            <Input
              className="h-7 text-xs"
              type="number"
              value={(step.y as number) ?? ""}
              placeholder="0"
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                updateStepField("y", isNaN(v) ? undefined : v);
              }}
            />
          </FieldRow>
        </>
      )}

      {step.action === "wait" && (
        <FieldRow label="Timeout">
          <Input
            className="h-7 text-xs"
            type="number"
            value={(step.timeout as number) ?? ""}
            placeholder="30000 ms"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              updateStepField("timeout", isNaN(v) ? undefined : v);
            }}
          />
        </FieldRow>
      )}

      {step.action === "drag" && (
        <>
          <div className="my-2 h-px bg-border" />
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            From
          </h4>
          <ElementTargetFields
            prefix="from"
            step={step}
            updateStepField={updateStepField}
          />
          <div className="my-2 h-px bg-border" />
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            To
          </h4>
          <ElementTargetFields
            prefix="to"
            step={step}
            updateStepField={updateStepField}
          />
        </>
      )}

      {step.action !== "pause" && (
        <>
          <div className="my-2 h-px bg-border" />
          <FieldRow label="Delay">
            <Input
              className="h-7 text-xs"
              type="number"
              value={(step.delay as number) ?? ""}
              placeholder="ms after step"
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                updateStepField("delay", isNaN(v) ? undefined : v);
              }}
            />
          </FieldRow>
        </>
      )}

      <FieldRow label="Label">
        <Input
          className="h-7 text-xs"
          value={(step.label as string) ?? ""}
          placeholder="HUD label"
          onChange={(e) => updateStepField("label", e.target.value)}
        />
      </FieldRow>
      <FieldRow label="Description">
        <Input
          className="h-7 text-xs"
          value={(step.description as string) ?? ""}
          placeholder="Optional"
          onChange={(e) => updateStepField("description", e.target.value)}
        />
      </FieldRow>
    </div>
  );
}

// ─── Props Pane ─────────────────────────────────────────────────────────────

const ACTIONS_WITH_SELECTOR = new Set([
  "click",
  "hover",
  "wait",
  "scroll",
  "moveTo",
  "select",
  "type",
]);

export function PropsPane() {
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const selectedStep = useAtomValue(selectedStepIndexAtom);
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const [pickedSelector, setPickedSelector] = useAtom(pickedSelectorAtom);
  const commit = useSetAtom(commitConfigAtom);
  const step =
    videoConfig && selectedStep >= 0 ? videoConfig.steps[selectedStep] : undefined;

  const prevPickedRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !pickedSelector ||
      pickedSelector === prevPickedRef.current ||
      !config ||
      !selectedVideo ||
      selectedStep < 0 ||
      !step ||
      !ACTIONS_WITH_SELECTOR.has(step.action)
    ) {
      prevPickedRef.current = pickedSelector;
      return;
    }

    prevPickedRef.current = pickedSelector;

    const draft = JSON.parse(configJson) as Record<string, unknown>;
    const videos = draft.videos as Record<string, Record<string, unknown>>;
    const video = videos[selectedVideo];
    if (!video) return;
    const steps = video.steps as Record<string, unknown>[];
    if (!steps[selectedStep]) return;
    steps[selectedStep].selector = pickedSelector;
    commit(JSON.stringify(draft, null, 2));
    setPickedSelector(null);
  }, [
    pickedSelector,
    config,
    configJson,
    selectedVideo,
    selectedStep,
    step,
    commit,
    setPickedSelector,
  ]);

  const [tab, setTab] = useState(step ? "step" : "video");

  useEffect(() => {
    if (!step && tab === "step") {
      setTab("video");
    }
  }, [step, tab]);

  return (
    <div className="flex h-full flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
        <div className="shrink-0 px-2 pt-1">
          <TabsList variant="line" className="h-7 w-full">
            <TabsTrigger value="video" className="text-[11px]">
              Video
            </TabsTrigger>
            <TabsTrigger value="step" className="text-[11px]" disabled={!step}>
              Step
              {selectedStep >= 0 && step && (
                <span className="ml-1 text-[9px] tabular-nums text-muted-foreground">
                  #{selectedStep + 1}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="theme" className="text-[11px]">
              Theme
            </TabsTrigger>
            <TabsTrigger value="audio" className="text-[11px]">
              Audio
            </TabsTrigger>
            <TabsTrigger value="includes" className="text-[11px]">
              Inc
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="video" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {videoConfig ? (
              <VideoSettingsForm videoConfig={videoConfig} />
            ) : (
              <div className="flex h-32 items-center justify-center">
                <p className="text-xs text-muted-foreground">
                  {selectedVideo ? "Video not found" : "Select a video"}
                </p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
        <TabsContent value="step" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {step ? (
              <StepPropertiesForm step={step} stepIndex={selectedStep} />
            ) : (
              <div className="flex h-32 items-center justify-center">
                <p className="text-xs text-muted-foreground">Select a step to edit</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
        <TabsContent value="theme" className="min-h-0 flex-1 overflow-hidden">
          <ThemeEditor />
        </TabsContent>
        <TabsContent value="audio" className="min-h-0 flex-1 overflow-hidden">
          <SfxConfigEditor />
        </TabsContent>
        <TabsContent value="includes" className="min-h-0 flex-1 overflow-hidden">
          <IncludeManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
