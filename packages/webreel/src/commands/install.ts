import { Command } from "commander";
import { rmSync } from "node:fs";
import {
  ensureChrome,
  ensureHeadlessShell,
  ensureFfmpeg,
  CHROME_CACHE_DIR,
  HEADLESS_SHELL_CACHE_DIR,
  FFMPEG_CACHE_DIR,
} from "@webreel/core";

interface InstallStep {
  label: string;
  cacheDir: string;
  envVar?: string;
  run: () => Promise<string>;
}

const STEPS: InstallStep[] = [
  {
    label: "Chrome (headless shell)",
    cacheDir: HEADLESS_SHELL_CACHE_DIR,
    envVar: "CHROME_HEADLESS_PATH",
    run: ensureHeadlessShell,
  },
  {
    label: "Chrome (full, for preview)",
    cacheDir: CHROME_CACHE_DIR,
    envVar: "CHROME_PATH",
    run: ensureChrome,
  },
  {
    label: "ffmpeg",
    cacheDir: FFMPEG_CACHE_DIR,
    envVar: "FFMPEG_PATH",
    run: ensureFfmpeg,
  },
];

export const installCommand = new Command("install")
  .description("Download Chrome and ffmpeg to ~/.webreel")
  .option("--force", "delete cached binaries and re-download")
  .action(async (opts: { force?: boolean }) => {
    const pending: InstallStep[] = [];

    for (const step of STEPS) {
      const override = step.envVar ? process.env[step.envVar] : undefined;
      if (override) {
        console.log(`Skipping ${step.label}, using ${step.envVar}=${override}`);
        continue;
      }

      if (opts.force) {
        rmSync(step.cacheDir, { recursive: true, force: true });
      }

      pending.push(step);
    }

    if (pending.length === 0) {
      console.log("Nothing to install.");
      return;
    }

    console.log(`Installing ${pending.map((s) => s.label).join(", ")}...\n`);

    type StepResult =
      | { ok: true; step: InstallStep; binPath: string }
      | { ok: false; step: InstallStep; error: string };

    const results = await Promise.all(
      pending.map(async (step): Promise<StepResult> => {
        try {
          const binPath = await step.run();
          return { ok: true, step, binPath };
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          return { ok: false, step, error };
        }
      }),
    );

    const failed: string[] = [];
    for (const result of results) {
      if (result.ok) {
        console.log(`${result.step.label} ready: ${result.binPath}`);
      } else {
        console.error(`${result.step.label} failed: ${result.error}`);
        failed.push(result.step.label);
      }
    }

    if (failed.length > 0) {
      console.error(`\nFailed to install: ${failed.join(", ")}`);
      process.exit(1);
    }

    console.log("\nAll dependencies installed.");
  });
