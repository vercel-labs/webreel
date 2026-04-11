"use client";

import { useMemo } from "react";
import { useAtom, useAtomValue } from "jotai/react";
import { configJsonAtom, envVarsAtom } from "@/store/config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle } from "lucide-react";

function detectEnvVars(json: string): string[] {
  const matches = json.match(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g);
  if (!matches) return [];
  const names = new Set<string>();
  for (const m of matches) {
    const name = m.replace(/^\$\{?/, "").replace(/\}$/, "");
    names.add(name);
  }
  return Array.from(names).sort();
}

export function EnvVarsPanel() {
  const configJson = useAtomValue(configJsonAtom);
  const [envVars, setEnvVars] = useAtom(envVarsAtom);

  const detectedVars = useMemo(() => detectEnvVars(configJson), [configJson]);

  if (detectedVars.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-xs text-muted-foreground">
          No environment variables detected in config.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <p className="text-[10px] text-muted-foreground/60">
          Variables referenced as ${"{VAR}"} in the config. Set values here for preview
          and recording.
        </p>
        {detectedVars.map((name) => {
          const hasValue = name in envVars && envVars[name] !== "";
          return (
            <div key={name} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${name}
                </Label>
                {!hasValue && <AlertCircle className="size-3 text-warning" />}
              </div>
              <Input
                className="h-7 font-mono text-xs"
                value={envVars[name] ?? ""}
                placeholder="Not set"
                onChange={(e) =>
                  setEnvVars((prev) => ({ ...prev, [name]: e.target.value }))
                }
              />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
