import { Command } from "commander";
import { existsSync, rmSync } from "node:fs";
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
    envVar: "CHROME_HEADLESS_SHELL_PATH",
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
    const failed: string[] = [];

    for (const step of STEPS) {
      const override = step.envVar ? process.env[step.envVar] : undefined;
      if (override) {
        console.log(`Skipping ${step.label}, using ${step.envVar}=${override}`);
        continue;
      }

      const cacheDir = step.cacheDir;

      if (opts.force) {
        rmSync(cacheDir, { recursive: true, force: true });
      }

      const cached = existsSync(cacheDir);
      console.log(
        cached
          ? `${step.label}: found in cache, verifying...`
          : `${step.label}: downloading...`,
      );

      try {
        const binPath = await step.run();
        console.log(`  ${step.label} ready: ${binPath}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ${step.label} failed: ${msg}`);
        failed.push(step.label);
      }
    }

    if (failed.length > 0) {
      console.error(`\nFailed to install: ${failed.join(", ")}`);
      process.exit(1);
    }

    console.log("\nAll dependencies installed.");
  });
