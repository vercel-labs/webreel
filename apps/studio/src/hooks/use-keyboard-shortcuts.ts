"use client";

import { useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai/react";
import {
  undoAtom,
  redoAtom,
  canUndoAtom,
  canRedoAtom,
  selectedStepIndexAtom,
  selectedVideoConfigAtom,
  configJsonAtom,
  parsedConfigAtom,
  selectedVideoAtom,
  commitConfigAtom,
  pickModeAtom,
  clipboardStepsAtom,
  renderStatusAtom,
} from "@/store/config";
import type { Step } from "@/store/config";

interface ShortcutHandlers {
  onSave?: () => void;
  onOpen?: () => void;
  onCommandPalette?: () => void;
  onStartRender?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);
  const [selectedStep, setSelectedStep] = useAtom(selectedStepIndexAtom);
  const videoConfig = useAtomValue(selectedVideoConfigAtom);
  const [configJson] = useAtom(configJsonAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const selectedVideo = useAtomValue(selectedVideoAtom);
  const commit = useSetAtom(commitConfigAtom);
  const setPickMode = useSetAtom(pickModeAtom);
  const [clipboardSteps, setClipboardSteps] = useAtom(clipboardStepsAtom);
  const renderStatus = useAtomValue(renderStatusAtom);

  useEffect(() => {
    function isEditing() {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      if (el.closest(".cm-editor")) return true;
      return false;
    }

    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;

      // Ctrl+S: save
      if (mod && e.key === "s") {
        e.preventDefault();
        handlers.onSave?.();
        return;
      }

      // Ctrl+O: open
      if (mod && e.key === "o") {
        e.preventDefault();
        handlers.onOpen?.();
        return;
      }

      // Ctrl+K: command palette
      if (mod && e.key === "k") {
        e.preventDefault();
        handlers.onCommandPalette?.();
        return;
      }

      // Ctrl+Enter: start recording
      if (mod && e.key === "Enter") {
        e.preventDefault();
        if (renderStatus !== "running") {
          handlers.onStartRender?.();
        }
        return;
      }

      // Ctrl+Z: undo (not in editor)
      if (mod && !e.shiftKey && e.key === "z" && !isEditing()) {
        e.preventDefault();
        if (canUndo) undo();
        return;
      }

      // Ctrl+Shift+Z: redo (not in editor)
      if (mod && e.shiftKey && e.key === "z" && !isEditing()) {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }

      // Ctrl+D: duplicate step
      if (mod && e.key === "d" && !isEditing()) {
        e.preventDefault();
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
        return;
      }

      // Ctrl+C: copy step
      if (mod && e.key === "c" && !isEditing()) {
        if (!videoConfig || selectedStep < 0) return;
        const step = videoConfig.steps[selectedStep];
        if (step) setClipboardSteps([JSON.parse(JSON.stringify(step)) as Step]);
        return;
      }

      // Ctrl+V: paste step
      if (mod && e.key === "v" && !isEditing()) {
        if (!config || !selectedVideo || clipboardSteps.length === 0) return;
        const draft = JSON.parse(configJson) as Record<string, unknown>;
        const videos = draft.videos as Record<string, Record<string, unknown>>;
        const video = videos[selectedVideo];
        if (!video) return;
        const steps = video.steps as Record<string, unknown>[];
        const insertAt = selectedStep >= 0 ? selectedStep + 1 : steps.length;
        for (let i = 0; i < clipboardSteps.length; i++) {
          steps.splice(insertAt + i, 0, JSON.parse(JSON.stringify(clipboardSteps[i])));
        }
        commit(JSON.stringify(draft, null, 2));
        setSelectedStep(insertAt);
        return;
      }

      // Escape: cancel pick mode, deselect step
      if (e.key === "Escape" && !isEditing()) {
        setPickMode(false);
        setSelectedStep(-1);
        return;
      }

      if (isEditing()) return;

      // Delete/Backspace: delete selected step
      if ((e.key === "Delete" || e.key === "Backspace") && selectedStep >= 0) {
        e.preventDefault();
        if (!config || !selectedVideo) return;
        const draft = JSON.parse(configJson) as Record<string, unknown>;
        const videos = draft.videos as Record<string, Record<string, unknown>>;
        const video = videos[selectedVideo];
        if (!video) return;
        const steps = video.steps as Record<string, unknown>[];
        steps.splice(selectedStep, 1);
        commit(JSON.stringify(draft, null, 2));
        const newIndex = Math.min(selectedStep, steps.length - 1);
        setSelectedStep(newIndex >= 0 ? newIndex : -1);
        return;
      }

      // ArrowUp: previous step
      if (e.key === "ArrowUp" && videoConfig) {
        e.preventDefault();
        if (selectedStep > 0) setSelectedStep(selectedStep - 1);
        else if (selectedStep === -1 && videoConfig.steps.length > 0) {
          setSelectedStep(videoConfig.steps.length - 1);
        }
        return;
      }

      // ArrowDown: next step
      if (e.key === "ArrowDown" && videoConfig) {
        e.preventDefault();
        if (selectedStep < videoConfig.steps.length - 1)
          setSelectedStep(selectedStep + 1);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handlers,
    canUndo,
    canRedo,
    undo,
    redo,
    selectedStep,
    setSelectedStep,
    videoConfig,
    config,
    configJson,
    selectedVideo,
    commit,
    setPickMode,
    clipboardSteps,
    setClipboardSteps,
    renderStatus,
  ]);
}
