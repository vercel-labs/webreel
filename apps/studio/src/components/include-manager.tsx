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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, FileText } from "lucide-react";

function IncludeList({
  title,
  includes,
  onAdd,
  onRemove,
  onChange,
}: {
  title: string;
  includes: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
        <Button variant="ghost" size="icon-xs" onClick={onAdd} title="Add include">
          <Plus className="size-3" />
        </Button>
      </div>
      {includes.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/60">
          No includes. Steps from included files are prepended to the video.
        </p>
      ) : (
        <div className="space-y-1.5">
          {includes.map((path, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <FileText className="size-3 shrink-0 text-muted-foreground/50" />
              <Input
                className="h-6 flex-1 text-xs"
                value={path}
                placeholder="path/to/steps.json"
                onChange={(e) => onChange(i, e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemove(i)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function IncludeManager() {
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const commit = useSetAtom(commitConfigAtom);

  const rootIncludes = config?.include ?? [];
  const videoIncludes = videoConfig?.include ?? [];

  const updateRootIncludes = useCallback(
    (updater: (arr: string[]) => string[]) => {
      if (!config) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      const current = (draft.include as string[]) ?? [];
      const next = updater([...current]);
      if (next.length > 0) {
        draft.include = next;
      } else {
        delete draft.include;
      }
      commit(JSON.stringify(draft, null, 2));
    },
    [config, configJson, commit],
  );

  const updateVideoIncludes = useCallback(
    (updater: (arr: string[]) => string[]) => {
      if (!config || !selectedVideo) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      const videos = draft.videos as Record<string, Record<string, unknown>>;
      const video = videos[selectedVideo];
      if (!video) return;
      const current = (video.include as string[]) ?? [];
      const next = updater([...current]);
      if (next.length > 0) {
        video.include = next;
      } else {
        delete video.include;
      }
      commit(JSON.stringify(draft, null, 2));
    },
    [config, configJson, selectedVideo, commit],
  );

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        <IncludeList
          title="Global Includes"
          includes={rootIncludes}
          onAdd={() => updateRootIncludes((arr) => [...arr, ""])}
          onRemove={(i) =>
            updateRootIncludes((arr) => {
              arr.splice(i, 1);
              return arr;
            })
          }
          onChange={(i, v) =>
            updateRootIncludes((arr) => {
              arr[i] = v;
              return arr;
            })
          }
        />

        <div className="h-px bg-border" />

        {selectedVideo ? (
          <IncludeList
            title={`Includes for "${selectedVideo}"`}
            includes={videoIncludes}
            onAdd={() => updateVideoIncludes((arr) => [...arr, ""])}
            onRemove={(i) =>
              updateVideoIncludes((arr) => {
                arr.splice(i, 1);
                return arr;
              })
            }
            onChange={(i, v) =>
              updateVideoIncludes((arr) => {
                arr[i] = v;
                return arr;
              })
            }
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Select a video to manage its includes.
          </p>
        )}

        <div className="h-px bg-border" />

        <p className="text-[10px] text-muted-foreground/60">
          Include files export a steps array that gets prepended to the video&apos;s steps
          at recording time. Paths are relative to the config file directory. Supports
          .json, .ts, and .js files.
        </p>
      </div>
    </ScrollArea>
  );
}
