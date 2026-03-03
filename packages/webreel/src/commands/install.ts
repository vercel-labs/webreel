import { Command } from "commander";
import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { ensureChrome, ensureHeadlessShell, ensureFfmpeg } from "@webreel/core";

const BIN_DIR = resolve(homedir(), ".webreel", "bin");

export const installCommand = new Command("install")
  .description("Download Chrome and ffmpeg to ~/.webreel")
  .option("--force", "delete cached binaries and re-download")
  .action(async (opts: { force?: boolean }) => {
    if (opts.force) {
      console.log("Clearing cached binaries...");
      rmSync(BIN_DIR, { recursive: true, force: true });
    }

    console.log("Ensuring Chrome (headless shell)...");
    await ensureHeadlessShell();

    console.log("Ensuring Chrome (full, for preview)...");
    await ensureChrome();

    console.log("Ensuring ffmpeg...");
    await ensureFfmpeg();

    console.log("All dependencies installed.");
  });
