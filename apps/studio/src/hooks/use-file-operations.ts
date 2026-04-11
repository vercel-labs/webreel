"use client";

import { useCallback } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai/react";
import {
  configJsonAtom,
  savedConfigJsonAtom,
  fileHandleAtom,
  fileNameAtom,
  commitConfigAtom,
  DEFAULT_CONFIG,
} from "@/store/config";

const hasFileSystemAccess =
  typeof window !== "undefined" && "showOpenFilePicker" in window;

export function useFileOperations() {
  const configJson = useAtomValue(configJsonAtom);
  const setSavedConfigJson = useSetAtom(savedConfigJsonAtom);
  const [fileHandle, setFileHandle] = useAtom(fileHandleAtom);
  const [fileName, setFileName] = useAtom(fileNameAtom);
  const commit = useSetAtom(commitConfigAtom);

  const downloadConfig = useCallback(() => {
    const blob = new Blob([configJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName ?? "webreel.config.json";
    a.click();
    URL.revokeObjectURL(url);
    setSavedConfigJson(configJson);
  }, [configJson, fileName, setSavedConfigJson]);

  const handleSave = useCallback(async () => {
    if (fileHandle) {
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(configJson);
        await writable.close();
        setSavedConfigJson(configJson);
      } catch {
        // permission denied or write error
      }
    } else if (hasFileSystemAccess) {
      try {
        const handle = await (
          window as unknown as {
            showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
          }
        ).showSaveFilePicker({
          suggestedName: fileName ?? "webreel.config.json",
          types: [
            {
              description: "Webreel Config",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(configJson);
        await writable.close();
        setSavedConfigJson(configJson);
        setFileHandle(handle);
        setFileName(handle.name);
      } catch {
        // user cancelled
      }
    } else {
      downloadConfig();
    }
  }, [
    fileHandle,
    configJson,
    fileName,
    setSavedConfigJson,
    setFileHandle,
    setFileName,
    downloadConfig,
  ]);

  const handleSaveAs = useCallback(async () => {
    if (hasFileSystemAccess) {
      try {
        const handle = await (
          window as unknown as {
            showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
          }
        ).showSaveFilePicker({
          suggestedName: fileName ?? "webreel.config.json",
          types: [
            {
              description: "Webreel Config",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(configJson);
        await writable.close();
        setSavedConfigJson(configJson);
        setFileHandle(handle);
        setFileName(handle.name);
      } catch {
        // user cancelled
      }
    } else {
      downloadConfig();
    }
  }, [
    configJson,
    fileName,
    setSavedConfigJson,
    setFileHandle,
    setFileName,
    downloadConfig,
  ]);

  const handleOpen = useCallback(async () => {
    if (hasFileSystemAccess) {
      try {
        const [handle] = await (
          window as unknown as {
            showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>;
          }
        ).showOpenFilePicker({
          types: [
            {
              description: "Webreel Config",
              accept: { "application/json": [".json"] },
            },
          ],
          multiple: false,
        });
        const file = await handle.getFile();
        const text = await file.text();
        commit(text);
        setSavedConfigJson(text);
        setFileHandle(handle);
        setFileName(file.name);
      } catch {
        // user cancelled
      }
    }
  }, [commit, setSavedConfigJson, setFileHandle, setFileName]);

  const handleNew = useCallback(() => {
    commit(DEFAULT_CONFIG);
    setSavedConfigJson(DEFAULT_CONFIG);
    setFileHandle(null);
    setFileName(null);
  }, [commit, setSavedConfigJson, setFileHandle, setFileName]);

  return {
    handleSave,
    handleSaveAs,
    handleOpen,
    handleNew,
    downloadConfig,
    hasFileSystemAccess,
  };
}
