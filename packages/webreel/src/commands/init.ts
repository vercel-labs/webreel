import { Command } from "commander";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_CONFIG_FILE } from "../lib/config.js";

const INIT_TEMPLATE = `{
  // JSON Schema for IDE autocompletion (VS Code, Cursor, JetBrains).
  // Full docs: https://webreel.dev/configuration
  "$schema": "https://webreel.dev/schema/v1.json",

  // Output directory for recorded videos (relative to this file).
  "outDir": "./videos",

  // Default delay (ms) after each step. Override per-step with "delay".
  "defaultDelay": 500,

  "videos": {
    "VIDEO_NAME": {
      "url": "VIDEO_URL",
      "viewport": { "width": 1920, "height": 1080 },

      // Optional: wait for an element before starting.
      // "waitFor": "[data-ready]",

      // Steps are executed in order. Each step is an action.
      // Use "pause" for explicit waits; use "delay" on any step for post-step waits.
      "steps": [
        { "action": "pause", "ms": 500 },
        { "action": "click", "text": "Get Started" },
        { "action": "key", "key": "mod+a", "delay": 1000 }
      ]
    }
  }
}
`;

export const initCommand = new Command("init")
  .description("Scaffold a new webreel config file")
  .option("--name <name>", "video name", "my-video")
  .option("--url <url>", "starting URL", "https://example.com")
  .option("-o, --output <file>", "output file path")
  .action((opts: { name: string; url: string; output?: string }) => {
    const fileName = opts.output ?? DEFAULT_CONFIG_FILE;
    const filePath = resolve(process.cwd(), fileName);

    if (existsSync(filePath)) {
      throw new Error(`File already exists: ${fileName}`);
    }

    const content = INIT_TEMPLATE.replace("VIDEO_NAME", opts.name).replace(
      "VIDEO_URL",
      opts.url,
    );

    writeFileSync(filePath, content);
    console.log(`Created ${fileName}`);
  });
