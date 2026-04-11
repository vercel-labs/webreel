"use client";

import { Timeline } from "@/components/timeline";
import { JsonEditor } from "@/components/json-editor";
import { EnvVarsPanel } from "@/components/env-vars";
import { DiffView } from "@/components/diff-view";
import { ValidationPanel, ValidationBadge } from "@/components/validation-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function LeftPane() {
  return (
    <Tabs defaultValue="timeline" className="flex h-full flex-col">
      <div className="shrink-0 px-2 pt-1">
        <TabsList variant="line" className="h-7 w-full">
          <TabsTrigger value="timeline" className="text-[11px]">
            Timeline
          </TabsTrigger>
          <TabsTrigger value="json" className="text-[11px]">
            JSON
          </TabsTrigger>
          <TabsTrigger value="diff" className="text-[11px]">
            Diff
          </TabsTrigger>
          <TabsTrigger value="env" className="text-[11px]">
            Env
          </TabsTrigger>
          <TabsTrigger value="issues" className="gap-1 text-[11px]">
            Issues
            <ValidationBadge />
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="timeline" className="min-h-0 flex-1 overflow-hidden">
        <Timeline />
      </TabsContent>
      <TabsContent value="json" className="min-h-0 flex-1 overflow-hidden">
        <JsonEditor />
      </TabsContent>
      <TabsContent value="diff" className="min-h-0 flex-1 overflow-hidden">
        <DiffView />
      </TabsContent>
      <TabsContent value="env" className="min-h-0 flex-1 overflow-hidden">
        <EnvVarsPanel />
      </TabsContent>
      <TabsContent value="issues" className="min-h-0 flex-1 overflow-hidden">
        <ValidationPanel />
      </TabsContent>
    </Tabs>
  );
}
