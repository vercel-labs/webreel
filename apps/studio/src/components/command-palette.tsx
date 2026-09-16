"use client";

import { useCallback, useEffect, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai/react";
import { Command } from "cmdk";
import {
  configJsonAtom,
  parsedConfigAtom,
  selectedVideoAtom,
  selectedStepIndexAtom,
  videoNamesAtom,
  commitConfigAtom,
  undoAtom,
  redoAtom,
  canUndoAtom,
  canRedoAtom,
  STEP_TEMPLATES,
  selectedVideoConfigAtom,
} from "@/store/config";
import { Plus, Undo2, Redo2, Play, Video, Trash2, Copy, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  onOpen?: () => void;
  onNew?: () => void;
  onStartRender?: () => void;
  onOpenSettings?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onSave,
  onOpen,
  onNew,
  onStartRender,
  onOpenSettings,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const videoNames = useAtomValue(videoNamesAtom);
  const [selectedVideo, setSelectedVideo] = useAtom(selectedVideoAtom);
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const [selectedStep, setSelectedStep] = useAtom(selectedStepIndexAtom);
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const commit = useSetAtom(commitConfigAtom);
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);
  const { setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const addStepFromTemplate = useCallback(
    (templateIndex: number) => {
      if (!config || !selectedVideo) return;
      const template = STEP_TEMPLATES[templateIndex];
      if (!template) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      const videos = draft.videos as Record<string, Record<string, unknown>>;
      const video = videos[selectedVideo];
      if (!video) return;
      const steps = video.steps as Record<string, unknown>[];
      steps.push(JSON.parse(JSON.stringify(template.step)));
      commit(JSON.stringify(draft, null, 2));
      setSelectedStep(steps.length - 1);
    },
    [config, configJson, selectedVideo, commit, setSelectedStep],
  );

  const duplicateStep = useCallback(() => {
    if (!config || !selectedVideo || !videoConfig || selectedStep < 0) return;
    const step = videoConfig.steps[selectedStep];
    if (!step) return;
    const draft = JSON.parse(configJson) as Record<string, unknown>;
    const videos = draft.videos as Record<string, Record<string, unknown>>;
    const video = videos[selectedVideo];
    if (!video) return;
    const steps = video.steps as Record<string, unknown>[];
    steps.splice(selectedStep + 1, 0, JSON.parse(JSON.stringify(step)));
    commit(JSON.stringify(draft, null, 2));
    setSelectedStep(selectedStep + 1);
  }, [
    config,
    configJson,
    selectedVideo,
    videoConfig,
    selectedStep,
    commit,
    setSelectedStep,
  ]);

  const deleteStep = useCallback(() => {
    if (!config || !selectedVideo || selectedStep < 0) return;
    const draft = JSON.parse(configJson) as Record<string, unknown>;
    const videos = draft.videos as Record<string, Record<string, unknown>>;
    const video = videos[selectedVideo];
    if (!video) return;
    const steps = video.steps as Record<string, unknown>[];
    steps.splice(selectedStep, 1);
    commit(JSON.stringify(draft, null, 2));
    setSelectedStep(Math.min(selectedStep, steps.length - 1));
  }, [config, configJson, selectedVideo, selectedStep, commit, setSelectedStep]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={close} />
      <div className="fixed left-[50%] top-[20%] z-50 w-full max-w-lg translate-x-[-50%]">
        <Command
          className="rounded-lg border bg-popover text-popover-foreground shadow-md"
          shouldFilter
          loop
        >
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Type a command..."
            className="flex h-10 w-full rounded-t-lg border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Command.List className="max-h-[300px] overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group
              heading="File"
              className="px-1 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:py-1"
            >
              <CommandItem
                onSelect={() => {
                  close();
                  onNew?.();
                }}
              >
                <Plus className="size-4" /> New Project
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  close();
                  onOpen?.();
                }}
              >
                Open File...
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  close();
                  onSave?.();
                }}
              >
                Save
              </CommandItem>
            </Command.Group>

            <Command.Group
              heading="Edit"
              className="px-1 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:py-1"
            >
              <CommandItem
                disabled={!canUndo}
                onSelect={() => {
                  undo();
                  close();
                }}
              >
                <Undo2 className="size-4" /> Undo
              </CommandItem>
              <CommandItem
                disabled={!canRedo}
                onSelect={() => {
                  redo();
                  close();
                }}
              >
                <Redo2 className="size-4" /> Redo
              </CommandItem>
              {videoConfig && selectedStep >= 0 && (
                <>
                  <CommandItem
                    onSelect={() => {
                      duplicateStep();
                      close();
                    }}
                  >
                    <Copy className="size-4" /> Duplicate Step
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      deleteStep();
                      close();
                    }}
                  >
                    <Trash2 className="size-4" /> Delete Step
                  </CommandItem>
                </>
              )}
            </Command.Group>

            <Command.Group
              heading="Videos"
              className="px-1 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:py-1"
            >
              {videoNames.map((name) => (
                <CommandItem
                  key={name}
                  onSelect={() => {
                    setSelectedVideo(name);
                    setSelectedStep(-1);
                    close();
                  }}
                >
                  <Video className="size-4" />
                  Switch to: {name}
                  {name === selectedVideo && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      current
                    </span>
                  )}
                </CommandItem>
              ))}
            </Command.Group>

            {selectedVideo && (
              <Command.Group
                heading="Add Step"
                className="px-1 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:py-1"
              >
                {STEP_TEMPLATES.map((template, i) => (
                  <CommandItem
                    key={template.label}
                    onSelect={() => {
                      addStepFromTemplate(i);
                      close();
                    }}
                  >
                    <Plus className="size-4" />
                    {template.label}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {template.description}
                    </span>
                  </CommandItem>
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading="Actions"
              className="px-1 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:py-1"
            >
              <CommandItem
                onSelect={() => {
                  close();
                  onStartRender?.();
                }}
              >
                <Play className="size-4" /> Start Recording
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  close();
                  onOpenSettings?.();
                }}
              >
                Settings
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  close();
                }}
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
                Toggle Theme
              </CommandItem>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function CommandItem({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item
      className={cn(
        "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </Command.Item>
  );
}
