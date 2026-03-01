import { Command } from "commander";
import { loadWebreelConfig, resolveConfigPath, getConfigDir } from "../lib/config.js";
import { runVideo } from "../lib/runner.js";

export const previewCommand = new Command("preview")
  .description("Run a video in a visible browser without recording")
  .argument("[video]", "Video name to preview (default: first video)")
  .option("-c, --config <path>", "Path to config file (default: webreel.config.json)")
  .option("--verbose", "Log each step as it executes")
  .action(
    async (
      videoName: string | undefined,
      opts: { config?: string; verbose?: boolean },
    ) => {
      const configPath = resolveConfigPath(opts.config);
      const configDir = getConfigDir(configPath);
      const verbose = opts.verbose ?? false;

      const webreelConfig = await loadWebreelConfig(configPath);

      let video;
      if (videoName) {
        video = webreelConfig.videos.find((v) => v.name === videoName);
        if (!video) {
          throw new Error(
            `Video "${videoName}" not found. Available: ${webreelConfig.videos.map((v) => v.name).join(", ")}`,
          );
        }
      } else {
        video = webreelConfig.videos[0];
        if (!video) {
          throw new Error("No videos defined in config.");
        }
      }

      console.log(`\nPreviewing: ${video.name}`);
      await runVideo(video, { record: false, verbose, configDir });
    },
  );
