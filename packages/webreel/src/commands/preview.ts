import { Command } from "commander";
import { loadFullConfig, resolveConfigPaths, filterVideos } from "../lib/config.js";
import { runVideo } from "../lib/runner.js";

function accumulate(val: string, prev: string[]): string[] {
  return [...prev, val];
}

export const previewCommand = new Command("preview")
  .description("Run a video in a visible browser without recording")
  .argument("[video]", "Video name to preview (default: first video)")
  .option("-c, --config <path>", "Config file (repeatable)", accumulate, [])
  .option("-f, --filter <name>", "Filter by video name/glob (repeatable)", accumulate, [])
  .option("--verbose", "Log each step as it executes")
  .action(
    async (
      videoName: string | undefined,
      opts: { config: string[]; filter: string[]; verbose?: boolean },
    ) => {
      const configPaths = await resolveConfigPaths(
        opts.config.length > 0 ? opts.config : undefined,
      );
      const verbose = opts.verbose ?? false;

      const fullConfig = await loadFullConfig(configPaths);
      const filtered = filterVideos(
        fullConfig.videos,
        videoName ? [videoName] : [],
        opts.filter,
      );

      if (filtered.length === 0) {
        throw new Error("No videos defined in config.");
      }

      const video = filtered[0];
      if (filtered.length > 1) {
        console.log(
          `Matched ${filtered.length} video(s). Previewing first match. Use video name for a specific video.`,
        );
      }

      console.log(`\nPreviewing: ${video.name}`);
      await runVideo(video, { record: false, verbose, configDir: video.configDir });
    },
  );
