"use client";

import { useState, useCallback } from "react";
import { useAtomValue } from "jotai/react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useFileOperations } from "@/hooks/use-file-operations";
import { LeftPane } from "@/components/left-pane";
import { Preview } from "@/components/preview";
import { PropsPane } from "@/components/props-pane";
import { Header } from "@/components/header";
import { CommandPalette } from "@/components/command-palette";
import { GlobalSettings } from "@/components/global-settings";
import { Separator } from "@/components/ui/separator";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { renderStatusAtom, parsedConfigAtom, selectedVideoAtom } from "@/store/config";

export default function StudioPage() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const renderStatus = useAtomValue(renderStatusAtom);
  const { config } = useAtomValue(parsedConfigAtom);
  const selectedVideo = useAtomValue(selectedVideoAtom);

  const { handleSave, handleOpen, handleNew } = useFileOperations();

  const handleStartRender = useCallback(async () => {
    if (renderStatus === "running" || !config || !selectedVideo) return;
    window.dispatchEvent(new CustomEvent("webreel:start-render"));
  }, [renderStatus, config, selectedVideo]);

  useKeyboardShortcuts({
    onSave: handleSave,
    onOpen: handleOpen,
    onCommandPalette: () => setCmdPaletteOpen(true),
    onStartRender: handleStartRender,
  });

  if (isDesktop) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <Header
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenCommandPalette={() => setCmdPaletteOpen(true)}
        />
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel id="left" defaultSize="25%" minSize="15%" maxSize="40%">
            <LeftPane />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="preview" defaultSize="50%" minSize="25%">
            <Preview />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="props" defaultSize="25%" minSize="15%" maxSize="40%">
            <PropsPane />
          </ResizablePanel>
        </ResizablePanelGroup>
        <CommandPalette
          open={cmdPaletteOpen}
          onOpenChange={setCmdPaletteOpen}
          onSave={handleSave}
          onOpen={handleOpen}
          onNew={handleNew}
          onStartRender={handleStartRender}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <GlobalSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenCommandPalette={() => setCmdPaletteOpen(true)}
      />
      <Tabs defaultValue="timeline" className="min-h-0 flex-1">
        <div className="shrink-0 px-2 pt-2">
          <TabsList className="w-full">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="props">Properties</TabsTrigger>
          </TabsList>
        </div>
        <Separator className="mt-2" />
        <TabsContent value="timeline" className="min-h-0 overflow-hidden">
          <LeftPane />
        </TabsContent>
        <TabsContent value="preview" className="min-h-0 overflow-hidden">
          <Preview />
        </TabsContent>
        <TabsContent value="props" className="min-h-0 overflow-hidden">
          <PropsPane />
        </TabsContent>
      </Tabs>
      <CommandPalette
        open={cmdPaletteOpen}
        onOpenChange={setCmdPaletteOpen}
        onSave={handleSave}
        onOpen={handleOpen}
        onNew={handleNew}
        onStartRender={handleStartRender}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <GlobalSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
