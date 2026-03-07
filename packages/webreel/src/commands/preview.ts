import { Command } from "commander";
import { loadFullConfig, resolveConfigPaths } from "../lib/config.js";
import { runVideo } from "../lib/runner.js";

function accumulate(val: string, prev: string[]): string[] {
  return [...prev, val];
}

export const previewCommand = new Command("preview")
  .description("Run a video in a visible browser without recording")
  .argument("[video]", "Video name to preview (default: first video)")
  .option("-c, --config <path>", "Config file (repeatable)", accumulate, [])
  .option("--verbose", "Log each step as it executes")
  .action(
    async (
      videoName: string | undefined,
      opts: { config: string[]; verbose?: boolean },
    ) => {
      const configPaths = await resolveConfigPaths(
        opts.config.length > 0 ? opts.config : undefined,
      );
      const verbose = opts.verbose ?? false;

      const fullConfig = await loadFullConfig(configPaths);

      let video;
      if (videoName) {
        video = fullConfig.videos.find((v) => v.name === videoName);
        if (!video) {
          throw new Error(
            `Video "${videoName}" not found. Available: ${fullConfig.videos.map((v) => v.name).join(", ")}`,
          );
        }
      } else {
        video = fullConfig.videos[0];
        if (!video) {
          throw new Error("No videos defined in config.");
        }
      }

      console.log(`\nPreviewing: ${video.name}`);
      await runVideo(video, { record: false, verbose, configDir: video.configDir });
    },
  );
