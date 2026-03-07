import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { compose, type TimelineData } from "@webreel/core";
import { loadFullConfig, resolveConfigPaths, filterVideos } from "../lib/config.js";
import { extractThumbnailIfConfigured } from "../lib/runner.js";

function accumulate(val: string, prev: string[]): string[] {
  return [...prev, val];
}

export const compositeCommand = new Command("composite")
  .description("Re-composite videos from stored raw recordings and timelines")
  .argument("[videos...]", "Video names to composite (default: all)")
  .option("-c, --config <path>", "Config file (repeatable)", accumulate, [])
  .option(
    "-p, --project <name>",
    "Filter by project name/glob (repeatable)",
    accumulate,
    [],
  )
  .action(async (videoNames: string[], opts: { config: string[]; project: string[] }) => {
    const configPaths = await resolveConfigPaths(
      opts.config.length > 0 ? opts.config : undefined,
    );
    const fullConfig = await loadFullConfig(configPaths);
    const videos = filterVideos(fullConfig.videos, videoNames, opts.project);

    for (const video of videos) {
      const videoDir = video.configDir;
      const rawPath = resolve(videoDir, ".webreel", "raw", `${video.name}.mp4`);
      const timelinePath = resolve(
        videoDir,
        ".webreel",
        "timelines",
        `${video.name}.timeline.json`,
      );

      if (!existsSync(rawPath)) {
        throw new Error(`Raw video not found: ${rawPath}. Run "webreel record" first.`);
      }
      if (!existsSync(timelinePath)) {
        throw new Error(
          `Timeline not found: ${timelinePath}. Run "webreel record" first.`,
        );
      }

      let timelineData: TimelineData;
      try {
        timelineData = JSON.parse(readFileSync(timelinePath, "utf-8"));
      } catch (err) {
        throw new Error(`Invalid timeline file: ${timelinePath}`, { cause: err });
      }
      const outputPath = video.output ?? resolve(videoDir, "videos", `${video.name}.mp4`);

      mkdirSync(dirname(outputPath), { recursive: true });
      console.log(`Compositing: ${video.name}`);
      await compose(rawPath, timelineData, outputPath, { sfx: video.sfx });

      await extractThumbnailIfConfigured(video, outputPath);

      console.log(`Done: ${outputPath}`);
    }
  });
