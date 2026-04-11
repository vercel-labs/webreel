"use client";

import { useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai/react";
import {
  configJsonAtom,
  parsedConfigAtom,
  commitConfigAtom,
  watchModeAtom,
} from "@/store/config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function GlobalSettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const commit = useSetAtom(commitConfigAtom);
  const [watchMode, setWatchMode] = useAtom(watchModeAtom);

  const updateRootField = useCallback(
    (field: string, value: unknown) => {
      if (!config) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      if (value === "" || value === undefined) {
        delete draft[field];
      } else {
        draft[field] = value;
      }
      commit(JSON.stringify(draft, null, 2));
    },
    [config, configJson, commit],
  );

  const updateNumericField = useCallback(
    (field: string, raw: string) => {
      const v = parseInt(raw, 10);
      updateRootField(field, isNaN(v) ? undefined : v);
    },
    [updateRootField],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Global Settings</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-2">
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground">Schema</h4>
              <FieldRow label="$schema">
                <Input
                  className="h-7 text-xs"
                  value={config?.$schema ?? ""}
                  readOnly
                  disabled
                />
              </FieldRow>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground">Output</h4>
              <FieldRow label="Output Dir">
                <Input
                  className="h-7 text-xs"
                  value={config?.outDir ?? ""}
                  placeholder="videos"
                  onChange={(e) => updateRootField("outDir", e.target.value)}
                />
              </FieldRow>
              <FieldRow label="Base URL">
                <Input
                  className="h-7 text-xs"
                  value={config?.baseUrl ?? ""}
                  placeholder="Optional"
                  onChange={(e) => updateRootField("baseUrl", e.target.value)}
                />
              </FieldRow>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground">
                Timing Defaults
              </h4>
              <FieldRow label="Default Delay">
                <Input
                  className="h-7 text-xs"
                  type="number"
                  value={config?.defaultDelay ?? ""}
                  placeholder="0 ms"
                  onChange={(e) => updateNumericField("defaultDelay", e.target.value)}
                />
              </FieldRow>
              <FieldRow label="Click Dwell">
                <Input
                  className="h-7 text-xs"
                  type="number"
                  value={config?.clickDwell ?? ""}
                  placeholder="80-180 ms (random)"
                  onChange={(e) => updateNumericField("clickDwell", e.target.value)}
                />
              </FieldRow>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground">Studio</h4>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Watch Mode</Label>
                <Switch checked={watchMode} onCheckedChange={setWatchMode} />
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                Auto-re-record when config changes are saved
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
