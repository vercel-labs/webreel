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
import type { SfxConfig } from "@/store/config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const SFX_VARIANTS = [
  { value: "1", label: "Variant 1" },
  { value: "2", label: "Variant 2" },
  { value: "3", label: "Variant 3" },
  { value: "4", label: "Variant 4" },
  { value: "custom", label: "Custom path..." },
];

function SfxField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number | undefined;
  onChange: (v: string | number | undefined) => void;
}) {
  const isCustom = typeof value === "string" && !["1", "2", "3", "4"].includes(value);
  const selectValue = isCustom ? "custom" : value != null ? String(value) : "";

  return (
    <div className="space-y-1.5">
      <FieldRow label={label}>
        <Select
          value={selectValue || "1"}
          onValueChange={(v) => {
            if (v === "custom") {
              onChange("");
            } else {
              onChange(parseInt(v, 10));
            }
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SFX_VARIANTS.map((sv) => (
              <SelectItem key={sv.value} value={sv.value}>
                {sv.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      {(isCustom || selectValue === "custom") && (
        <FieldRow label="">
          <Input
            className="h-7 text-xs"
            value={typeof value === "string" ? value : ""}
            placeholder="path/to/sound.mp3"
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        </FieldRow>
      )}
    </div>
  );
}

export function SfxConfigEditor() {
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const commit = useSetAtom(commitConfigAtom);

  const sfx: SfxConfig = videoConfig?.sfx ?? config?.sfx ?? {};

  const updateSfx = useCallback(
    (field: "click" | "key", value: string | number | undefined) => {
      if (!config || !selectedVideo) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      const videos = draft.videos as Record<string, Record<string, unknown>>;
      const video = videos[selectedVideo];
      if (!video) return;

      const s = (video.sfx as Record<string, unknown>) ?? {};
      if (value === undefined || value === "") {
        delete s[field];
      } else {
        s[field] = value;
      }

      if (Object.keys(s).length > 0) {
        video.sfx = s;
      } else {
        delete video.sfx;
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
          <h4 className="text-xs font-medium text-muted-foreground">Click Sound</h4>
          <SfxField
            label="Click SFX"
            value={sfx.click}
            onChange={(v) => updateSfx("click", v as string | number | undefined)}
          />
        </div>

        <div className="h-px bg-border" />

        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground">Key Sound</h4>
          <SfxField
            label="Key SFX"
            value={sfx.key}
            onChange={(v) => updateSfx("key", v as string | number | undefined)}
          />
        </div>

        <div className="h-px bg-border" />

        <p className="text-[10px] text-muted-foreground/60">
          Built-in variants 1-4 are bundled with webreel. Use &quot;Custom path&quot; for
          your own .mp3 files (relative to config directory).
        </p>
      </div>
    </ScrollArea>
  );
}
