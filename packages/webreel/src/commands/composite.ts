import { Command } from "commander";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { buildAutoZoomFilter, compose, type TimelineData } from "@lgariv/webreel-core";
import {
  loadWebreelConfig,
  resolveConfigPath,
  getConfigDir,
  filterVideosByName,
} from "../lib/config.js";
import { extractThumbnailIfConfigured, normalizeAutoZoom } from "../lib/runner.js";

export const compositeCommand = new Command("composite")
  .description("Re-composite videos from stored raw recordings and timelines")
  .argument("[videos...]", "Video names to composite (default: all)")
  .option("-c, --config <path>", "Path to config file (default: webreel.config.json)")
  .action(async (videoNames: string[], opts: { config?: string }) => {
    const configPath = resolveConfigPath(opts.config);
    const configDir = getConfigDir(configPath);
    const webreelConfig = await loadWebreelConfig(configPath);
    const videos = filterVideosByName(webreelConfig.videos, videoNames);

    for (const video of videos) {
      const rawPath = resolve(configDir, ".webreel", "raw", `${video.name}.mp4`);
      const timelinePath = resolve(
        configDir,
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
      const outputPath =
        video.output ?? resolve(configDir, "videos", `${video.name}.mp4`);

      mkdirSync(dirname(outputPath), { recursive: true });
      console.log(`Compositing: ${video.name}`);

      const autoZoomCfg = normalizeAutoZoom(video.autoZoom);
      const persistedZoomEvents = timelineData.zoomEvents ?? [];
      const zoomFilter =
        autoZoomCfg.enabled && persistedZoomEvents.length > 0
          ? buildAutoZoomFilter(
              persistedZoomEvents,
              { width: timelineData.width, height: timelineData.height },
              timelineData.zoom ?? 1,
              timelineData.frames.length / timelineData.fps,
              timelineData.fps,
              autoZoomCfg,
            )
          : null;
      if (zoomFilter) {
        console.log(
          `Applying autozoom (${persistedZoomEvents.length} event${persistedZoomEvents.length === 1 ? "" : "s"})`,
        );
      }

      await compose(rawPath, timelineData, outputPath, {
        sfx: video.sfx,
        zoomFilter: zoomFilter ?? undefined,
      });

      await extractThumbnailIfConfigured(video, outputPath);

      console.log(`Done: ${outputPath}`);
    }
  });
