"use client";

import { useCallback, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai/react";
import {
  configJsonAtom,
  savedConfigJsonAtom,
  fileHandleAtom,
  fileNameAtom,
  isDirtyAtom,
  canUndoAtom,
  canRedoAtom,
  undoAtom,
  redoAtom,
  commitConfigAtom,
} from "@/store/config";
import { useFileOperations } from "@/hooks/use-file-operations";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  FileUp,
  FolderOpen,
  Save,
  FilePlus,
  Download,
  Undo2,
  Redo2,
  Settings,
  Circle,
} from "lucide-react";

export interface HeaderHandlers {
  onOpenSettings?: () => void;
  onOpenCommandPalette?: () => void;
}

export function Header({ onOpenSettings }: HeaderHandlers) {
  const fileName = useAtomValue(fileNameAtom);
  const isDirty = useAtomValue(isDirtyAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const commit = useSetAtom(commitConfigAtom);
  const setSavedConfigJson = useSetAtom(savedConfigJsonAtom);
  const setFileHandle = useSetAtom(fileHandleAtom);
  const setFileName = useSetAtom(fileNameAtom);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    handleSave,
    handleSaveAs,
    handleOpen: handleOpenFile,
    handleNew,
    downloadConfig,
    hasFileSystemAccess,
  } = useFileOperations();

  const handleOpen = useCallback(async () => {
    if (hasFileSystemAccess) {
      await handleOpenFile();
    } else {
      fileInputRef.current?.click();
    }
  }, [hasFileSystemAccess, handleOpenFile]);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        commit(text);
        setSavedConfigJson(text);
        setFileHandle(null);
        setFileName(file.name);
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [commit, setSavedConfigJson, setFileHandle, setFileName],
  );

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="gap-1 text-xs font-medium">
            Webreel Studio
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={handleNew}>
            <FilePlus className="size-4" />
            New Project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleOpen}>
            <FolderOpen className="size-4" />
            Open...
            <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSave}>
            <Save className="size-4" />
            Save
            <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleSaveAs}>
            <FileUp className="size-4" />
            Save As...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={downloadConfig}>
            <Download className="size-4" />
            Export JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {fileName && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="max-w-[200px] truncate">{fileName}</span>
          {isDirty && <Circle className="size-2 fill-warning text-warning" />}
        </div>
      )}
      {!fileName && isDirty && (
        <span className="text-[11px] text-muted-foreground/60">unsaved</span>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => undo()}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => redo()}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="size-3.5" />
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" size="icon-xs" onClick={onOpenSettings} title="Settings">
          <Settings className="size-3.5" />
        </Button>
        <ThemeToggle />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}
