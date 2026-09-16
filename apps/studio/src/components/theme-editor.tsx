"use client";

import { useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai/react";
import {
  configJsonAtom,
  parsedConfigAtom,
  selectedVideoAtom,
  selectedVideoConfigAtom,
  commitConfigAtom,
} from "@/store/config";
import type { ThemeConfig } from "@/store/config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function ThemeEditor() {
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const commit = useSetAtom(commitConfigAtom);

  const theme: ThemeConfig = videoConfig?.theme ?? config?.theme ?? {};

  const updateTheme = useCallback(
    (path: string, value: unknown) => {
      if (!config || !selectedVideo) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      const videos = draft.videos as Record<string, Record<string, unknown>>;
      const video = videos[selectedVideo];
      if (!video) return;

      const t = (video.theme as Record<string, unknown>) ?? {};
      const parts = path.split(".");

      if (parts.length === 2) {
        const [group, field] = parts;
        const obj = (t[group] as Record<string, unknown>) ?? {};
        if (value === "" || value === undefined) {
          delete obj[field];
        } else {
          obj[field] = value;
        }
        if (Object.keys(obj).length > 0) {
          t[group] = obj;
        } else {
          delete t[group];
        }
      }

      if (Object.keys(t).length > 0) {
        video.theme = t;
      } else {
        delete video.theme;
      }

      commit(JSON.stringify(draft, null, 2));
    },
    [config, configJson, selectedVideo, commit],
  );

  if (!videoConfig) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-xs text-muted-foreground">Select a video</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground">Cursor</h4>
          <FieldRow label="Size">
            <div className="flex items-center gap-2">
              <Slider
                min={8}
                max={64}
                step={1}
                value={[theme.cursor?.size ?? 24]}
                onValueChange={([v]) => updateTheme("cursor.size", v)}
                className="flex-1"
              />
              <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                {theme.cursor?.size ?? 24}
              </span>
            </div>
          </FieldRow>
          <FieldRow label="Hotspot">
            <Select
              value={theme.cursor?.hotspot ?? "top-left"}
              onValueChange={(v) => updateTheme("cursor.hotspot", v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top-left">Top Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Custom SVG">
            <Input
              className="h-7 text-xs"
              value={theme.cursor?.image ?? ""}
              placeholder="Path to SVG"
              onChange={(e) => updateTheme("cursor.image", e.target.value)}
            />
          </FieldRow>
        </div>

        <div className="h-px bg-border" />

        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground">HUD (Key Labels)</h4>
          <FieldRow label="Background">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={theme.hud?.background ?? "#000000"}
                onChange={(e) => updateTheme("hud.background", e.target.value)}
                className="size-7 cursor-pointer rounded border bg-transparent"
              />
              <Input
                className="h-7 flex-1 text-xs"
                value={theme.hud?.background ?? ""}
                placeholder="#000000"
                onChange={(e) => updateTheme("hud.background", e.target.value)}
              />
            </div>
          </FieldRow>
          <FieldRow label="Text Color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={theme.hud?.color ?? "#ffffff"}
                onChange={(e) => updateTheme("hud.color", e.target.value)}
                className="size-7 cursor-pointer rounded border bg-transparent"
              />
              <Input
                className="h-7 flex-1 text-xs"
                value={theme.hud?.color ?? ""}
                placeholder="#ffffff"
                onChange={(e) => updateTheme("hud.color", e.target.value)}
              />
            </div>
          </FieldRow>
          <FieldRow label="Font Size">
            <div className="flex items-center gap-2">
              <Slider
                min={12}
                max={120}
                step={1}
                value={[theme.hud?.fontSize ?? 56]}
                onValueChange={([v]) => updateTheme("hud.fontSize", v)}
                className="flex-1"
              />
              <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                {theme.hud?.fontSize ?? 56}
              </span>
            </div>
          </FieldRow>
          <FieldRow label="Font Family">
            <Input
              className="h-7 text-xs"
              value={theme.hud?.fontFamily ?? ""}
              placeholder="Geist, sans-serif"
              onChange={(e) => updateTheme("hud.fontFamily", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Radius">
            <div className="flex items-center gap-2">
              <Slider
                min={0}
                max={50}
                step={1}
                value={[theme.hud?.borderRadius ?? 18]}
                onValueChange={([v]) => updateTheme("hud.borderRadius", v)}
                className="flex-1"
              />
              <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                {theme.hud?.borderRadius ?? 18}
              </span>
            </div>
          </FieldRow>
          <FieldRow label="Position">
            <Select
              value={theme.hud?.position ?? "bottom"}
              onValueChange={(v) => updateTheme("hud.position", v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Top</SelectItem>
                <SelectItem value="bottom">Bottom</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </div>
      </div>
    </ScrollArea>
  );
}
