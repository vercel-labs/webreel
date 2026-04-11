"use client";

import { useCallback, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai/react";
import {
  configJsonAtom,
  parsedConfigAtom,
  selectedVideoAtom,
  selectedVideoConfigAtom,
  selectedStepIndexAtom,
  videoNamesAtom,
  commitConfigAtom,
  STEP_TEMPLATES,
} from "@/store/config";
import type { Step } from "@/store/config";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MousePointerClick,
  Keyboard,
  Type,
  Clock,
  Move,
  ArrowDown,
  Eye,
  Camera,
  Globe,
  GripVertical,
  Pointer,
  ListChecks,
  Plus,
  Trash2,
  MoreHorizontal,
  Copy,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_META: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    color: string;
  }
> = {
  click: { icon: MousePointerClick, label: "Click", color: "text-blue-400" },
  type: { icon: Type, label: "Type", color: "text-green-400" },
  key: { icon: Keyboard, label: "Key", color: "text-yellow-400" },
  pause: { icon: Clock, label: "Pause", color: "text-muted-foreground" },
  wait: { icon: Eye, label: "Wait", color: "text-purple-400" },
  scroll: { icon: ArrowDown, label: "Scroll", color: "text-cyan-400" },
  moveTo: { icon: Move, label: "Move To", color: "text-orange-400" },
  navigate: { icon: Globe, label: "Navigate", color: "text-pink-400" },
  screenshot: { icon: Camera, label: "Screenshot", color: "text-emerald-400" },
  hover: { icon: Pointer, label: "Hover", color: "text-indigo-400" },
  drag: { icon: GripVertical, label: "Drag", color: "text-red-400" },
  select: { icon: ListChecks, label: "Select", color: "text-teal-400" },
};

function getStepDescription(step: Step): string {
  switch (step.action) {
    case "click":
      return (step.text as string) || (step.selector as string) || "element";
    case "type":
      return `"${step.text as string}"`;
    case "key":
      return step.key as string;
    case "pause":
      return `${step.ms as number}ms`;
    case "wait":
      return (step.selector as string) || (step.text as string) || "condition";
    case "scroll":
      return `x:${step.x ?? 0} y:${step.y ?? 0}`;
    case "navigate":
      return step.url as string;
    case "screenshot":
      return step.output as string;
    case "hover":
      return (step.text as string) || (step.selector as string) || "element";
    case "drag":
      return "from -> to";
    case "select":
      return (step.value as string) || "option";
    case "moveTo":
      return (step.text as string) || (step.selector as string) || "element";
    default:
      return step.action;
  }
}

function StepCard({
  step,
  isSelected,
  isDragSource,
  shiftY,
  isDragging,
  onClick,
  onDelete,
  onDuplicate,
  onGripPointerDown,
}: {
  step: Step;
  isSelected: boolean;
  isDragSource?: boolean;
  shiftY?: number;
  isDragging?: boolean;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onGripPointerDown?: (e: React.PointerEvent) => void;
}) {
  const meta = ACTION_META[step.action] ?? {
    icon: Clock,
    label: step.action,
    color: "text-muted-foreground",
  };
  const Icon = meta.icon;
  const description = getStepDescription(step);
  const delay = step.delay as number | undefined;

  return (
    <div
      data-step-card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }
      }}
      style={{
        transform: shiftY ? `translateY(${shiftY}px)` : undefined,
        transition: isDragging
          ? "transform 200ms cubic-bezier(0.25, 1, 0.5, 1)"
          : undefined,
        opacity: isDragSource ? 0 : undefined,
      }}
      className={cn(
        "group/step relative flex w-full items-center gap-3 rounded-md py-1.5 pr-2 pl-0 text-left",
        !isDragging && "transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <div
        onPointerDown={onGripPointerDown}
        className="relative z-10 flex size-7 shrink-0 cursor-grab items-center justify-center rounded-full border bg-background touch-none select-none active:cursor-grabbing"
      >
        <Icon className={cn("size-3.5", meta.color)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{meta.label}</span>
          {delay != null && (
            <span className="text-[10px] text-muted-foreground">+{delay}ms</span>
          )}
        </div>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/step:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
          title="Duplicate"
        >
          <Copy className="size-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Video CRUD dialogs ─────────────────────────────────────────────────────

function CreateVideoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("https://");
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const commit = useSetAtom(commitConfigAtom);
  const setSelectedVideo = useSetAtom(selectedVideoAtom);
  const setSelectedStep = useSetAtom(selectedStepIndexAtom);

  const handleCreate = useCallback(() => {
    if (!config || !name.trim()) return;
    const draft = JSON.parse(configJson) as Record<string, unknown>;
    const videos = draft.videos as Record<string, unknown>;
    if (videos[name.trim()]) return;
    videos[name.trim()] = {
      url: url || "https://example.com",
      viewport: { width: 1920, height: 1080 },
      steps: [{ action: "pause", ms: 500 }],
    };
    commit(JSON.stringify(draft, null, 2));
    setSelectedVideo(name.trim());
    setSelectedStep(-1);
    onOpenChange(false);
    setName("");
    setUrl("https://");
  }, [
    config,
    configJson,
    name,
    url,
    commit,
    setSelectedVideo,
    setSelectedStep,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">New Video</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              className="h-7 text-xs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-video"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input
              className="h-7 text-xs"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameVideoDialog({
  open,
  onOpenChange,
  currentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
}) {
  const [newName, setNewName] = useState(currentName);
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const commit = useSetAtom(commitConfigAtom);
  const setSelectedVideo = useSetAtom(selectedVideoAtom);

  const handleRename = useCallback(() => {
    if (!config || !newName.trim() || newName.trim() === currentName) return;
    const draft = JSON.parse(configJson) as Record<string, unknown>;
    const videos = draft.videos as Record<string, unknown>;
    if (videos[newName.trim()]) return;
    videos[newName.trim()] = videos[currentName];
    delete videos[currentName];
    commit(JSON.stringify(draft, null, 2));
    setSelectedVideo(newName.trim());
    onOpenChange(false);
  }, [config, configJson, currentName, newName, commit, setSelectedVideo, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Rename Video</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">New name</Label>
          <Input
            className="h-7 text-xs"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
        </div>
        <DialogFooter>
          <Button
            size="sm"
            onClick={handleRename}
            disabled={!newName.trim() || newName.trim() === currentName}
          >
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Timeline ──────────────────────────────────────────────────────────

export function Timeline() {
  const videoNames = useAtomValue(videoNamesAtom);
  const [selectedVideo, setSelectedVideo] = useAtom(selectedVideoAtom);
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const [selectedStep, setSelectedStep] = useAtom(selectedStepIndexAtom);
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const commit = useSetAtom(commitConfigAtom);

  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [addStepOpen, setAddStepOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragDataRef = useRef<{
    sourceIndex: number;
    startY: number;
    offsetY: number;
    sourceHeight: number;
    cardLeft: number;
    cardWidth: number;
    rects: { top: number; height: number; midY: number }[];
    overIndex: number;
    activated: boolean;
  } | null>(null);
  const didDragRef = useRef(false);
  const [drag, setDrag] = useState<{
    sourceIndex: number;
    overIndex: number;
  } | null>(null);

  const addStep = useCallback(
    (template?: Step) => {
      if (!config || !selectedVideo) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      const videos = draft.videos as Record<string, Record<string, unknown>>;
      const video = videos[selectedVideo];
      if (!video) return;
      const steps = video.steps as Record<string, unknown>[];
      const newStep = template
        ? JSON.parse(JSON.stringify(template))
        : { action: "pause", ms: 500 };
      steps.push(newStep);
      commit(JSON.stringify(draft, null, 2));
      setSelectedStep(steps.length - 1);
    },
    [config, configJson, selectedVideo, commit, setSelectedStep],
  );

  const deleteStep = useCallback(
    (index: number) => {
      if (!config || !selectedVideo) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      const videos = draft.videos as Record<string, Record<string, unknown>>;
      const video = videos[selectedVideo];
      if (!video) return;
      const steps = video.steps as Record<string, unknown>[];
      steps.splice(index, 1);
      commit(JSON.stringify(draft, null, 2));
      if (selectedStep === index) setSelectedStep(-1);
      else if (selectedStep > index) setSelectedStep(selectedStep - 1);
    },
    [config, configJson, selectedVideo, selectedStep, commit, setSelectedStep],
  );

  const moveStep = useCallback(
    (from: number, to: number) => {
      if (!config || !selectedVideo) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      const videos = draft.videos as Record<string, Record<string, unknown>>;
      const video = videos[selectedVideo];
      if (!video) return;
      const steps = video.steps as Record<string, unknown>[];
      if (to < 0 || to >= steps.length) return;
      const [moved] = steps.splice(from, 1);
      steps.splice(to, 0, moved);
      commit(JSON.stringify(draft, null, 2));
      if (selectedStep === from) setSelectedStep(to);
      else if (selectedStep > from && selectedStep <= to)
        setSelectedStep(selectedStep - 1);
      else if (selectedStep < from && selectedStep >= to)
        setSelectedStep(selectedStep + 1);
    },
    [config, configJson, selectedVideo, selectedStep, commit, setSelectedStep],
  );

  const handleGripPointerDown = useCallback(
    (index: number, e: React.PointerEvent) => {
      e.preventDefault();

      const listEl = listRef.current;
      if (!listEl) return;

      const cards = Array.from(listEl.querySelectorAll<HTMLElement>("[data-step-card]"));
      const rects = cards.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, height: r.height, midY: r.top + r.height / 2 };
      });
      const cardRect = cards[index].getBoundingClientRect();

      const data = {
        sourceIndex: index,
        startY: e.clientY,
        offsetY: e.clientY - cardRect.top,
        sourceHeight: cardRect.height,
        cardLeft: cardRect.left,
        cardWidth: cardRect.width,
        rects,
        overIndex: index,
        activated: false,
      };
      dragDataRef.current = data;

      const onMove = (ev: PointerEvent) => {
        if (!data.activated) {
          if (Math.abs(ev.clientY - data.startY) < 4) return;
          data.activated = true;
          document.body.style.userSelect = "none";
          setDrag({ sourceIndex: index, overIndex: index });
        }

        const y = ev.clientY - data.offsetY;
        if (overlayRef.current) {
          overlayRef.current.style.transform = `translate(${data.cardLeft}px, ${y}px)`;
        }

        let newOver = index;
        let minDist = Infinity;
        for (let i = 0; i < data.rects.length; i++) {
          const dist = Math.abs(ev.clientY - data.rects[i].midY);
          if (dist < minDist) {
            minDist = dist;
            newOver = i;
          }
        }

        if (newOver !== data.overIndex) {
          data.overIndex = newOver;
          setDrag({ sourceIndex: index, overIndex: newOver });
        }
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";

        const wasActivated = data.activated;
        const finalOver = data.overIndex;
        dragDataRef.current = null;

        if (wasActivated && finalOver !== index) {
          moveStep(index, finalOver);
        }
        setDrag(null);

        if (wasActivated) {
          didDragRef.current = true;
          setTimeout(() => {
            didDragRef.current = false;
          }, 0);
        }
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [moveStep],
  );

  const duplicateStep = useCallback(
    (index: number) => {
      if (!config || !selectedVideo || !videoConfig) return;
      const step = videoConfig.steps[index];
      if (!step) return;
      const draft = JSON.parse(configJson) as Record<string, unknown>;
      const videos = draft.videos as Record<string, Record<string, unknown>>;
      const video = videos[selectedVideo];
      if (!video) return;
      const steps = video.steps as Record<string, unknown>[];
      steps.splice(index + 1, 0, JSON.parse(JSON.stringify(step)));
      commit(JSON.stringify(draft, null, 2));
      setSelectedStep(index + 1);
    },
    [config, configJson, selectedVideo, videoConfig, commit, setSelectedStep],
  );

  const duplicateVideo = useCallback(() => {
    if (!config || !selectedVideo) return;
    const draft = JSON.parse(configJson) as Record<string, unknown>;
    const videos = draft.videos as Record<string, unknown>;
    let newName = `${selectedVideo}-copy`;
    let i = 2;
    while (videos[newName]) {
      newName = `${selectedVideo}-copy-${i}`;
      i++;
    }
    videos[newName] = JSON.parse(JSON.stringify(videos[selectedVideo]));
    commit(JSON.stringify(draft, null, 2));
    setSelectedVideo(newName);
    setSelectedStep(-1);
  }, [config, configJson, selectedVideo, commit, setSelectedVideo, setSelectedStep]);

  const deleteVideo = useCallback(() => {
    if (!config || !selectedVideo) return;
    const draft = JSON.parse(configJson) as Record<string, unknown>;
    const videos = draft.videos as Record<string, unknown>;
    delete videos[selectedVideo];
    commit(JSON.stringify(draft, null, 2));
    const remaining = Object.keys(videos);
    setSelectedVideo(remaining[0] ?? null);
    setSelectedStep(-1);
    setDeleteConfirmOpen(false);
  }, [config, configJson, selectedVideo, commit, setSelectedVideo, setSelectedStep]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
        <Select
          value={selectedVideo ?? undefined}
          onValueChange={(v) => {
            setSelectedVideo(v);
            setSelectedStep(-1);
          }}
        >
          <SelectTrigger className="h-6 w-auto min-w-[80px] gap-1 border-none bg-transparent px-1 text-xs shadow-none">
            <SelectValue placeholder="Select video" />
          </SelectTrigger>
          <SelectContent>
            {videoNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-0.5">
          {selectedVideo && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground">
                  <MoreHorizontal className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                  <Pencil className="size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={duplicateVideo}>
                  <Copy className="size-3.5" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setDeleteConfirmOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setCreateOpen(true)}
            className="text-muted-foreground"
            title="New video"
          >
            <Plus className="size-3" />
          </Button>
        </div>
      </div>

      <div className="h-px shrink-0 bg-border" />

      {videoConfig ? (
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div ref={listRef} className="relative pl-[13px]">
              {videoConfig.steps.length > 1 && (
                <div className="absolute left-[26px] top-5 bottom-5 w-px bg-border" />
              )}
              {videoConfig.steps.map((step, i) => {
                let shiftY = 0;
                if (drag && dragDataRef.current) {
                  const { sourceIndex, overIndex } = drag;
                  const h = dragDataRef.current.sourceHeight;
                  if (i !== sourceIndex) {
                    if (sourceIndex < overIndex && i > sourceIndex && i <= overIndex) {
                      shiftY = -h;
                    } else if (
                      sourceIndex > overIndex &&
                      i >= overIndex &&
                      i < sourceIndex
                    ) {
                      shiftY = h;
                    }
                  }
                }
                return (
                  <StepCard
                    key={i}
                    step={step}
                    isSelected={selectedStep === i}
                    isDragSource={drag?.sourceIndex === i}
                    shiftY={shiftY}
                    isDragging={drag !== null}
                    onClick={() => {
                      if (didDragRef.current) return;
                      setSelectedStep(i === selectedStep ? -1 : i);
                    }}
                    onDelete={() => deleteStep(i)}
                    onDuplicate={() => duplicateStep(i)}
                    onGripPointerDown={(e) => handleGripPointerDown(i, e)}
                  />
                );
              })}
            </div>

            <div className="mt-0.5 pl-[13px]">
              <DropdownMenu open={addStepOpen} onOpenChange={setAddStepOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-3 pl-0 text-xs text-muted-foreground"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed">
                      <Plus className="size-3" />
                    </span>
                    Add step
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {STEP_TEMPLATES.map((template) => (
                    <DropdownMenuItem
                      key={template.label}
                      onSelect={() => addStep(template.step)}
                    >
                      <span className="text-xs">{template.label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {template.step.action}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <p className="text-xs text-muted-foreground">
            {videoNames.length === 0 ? "No videos defined" : "Select a video"}
          </p>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setCreateOpen(true)}
            className="gap-1"
          >
            <Plus className="size-3" />
            New Video
          </Button>
        </div>
      )}

      <CreateVideoDialog open={createOpen} onOpenChange={setCreateOpen} />
      {selectedVideo && (
        <RenameVideoDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          currentName={selectedVideo}
        />
      )}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete video</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedVideo}&quot;? This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteVideo}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {drag &&
        videoConfig &&
        (() => {
          const step = videoConfig.steps[drag.sourceIndex];
          if (!step || !dragDataRef.current) return null;
          const meta = ACTION_META[step.action] ?? {
            icon: Clock,
            label: step.action,
            color: "text-muted-foreground",
          };
          const Icon = meta.icon;
          const delay = step.delay as number | undefined;
          const dd = dragDataRef.current;
          return (
            <div
              ref={overlayRef}
              className="pointer-events-none fixed left-0 top-0 z-50 will-change-transform"
              style={{
                width: dd.cardWidth,
                transform: `translate(${dd.cardLeft}px, ${dd.rects[drag.sourceIndex].top}px)`,
              }}
            >
              <div className="flex items-center gap-3 rounded-md border border-ring bg-accent py-1.5 pr-2 shadow-lg">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
                  <Icon className={cn("size-3.5", meta.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{meta.label}</span>
                    {delay != null && (
                      <span className="text-[10px] text-muted-foreground">
                        +{delay}ms
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">
                    {getStepDescription(step)}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
