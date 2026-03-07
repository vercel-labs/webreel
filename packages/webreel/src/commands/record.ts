import { Command } from "commander";
import { watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";
import { loadFullConfig, resolveConfigPaths, filterVideos } from "../lib/config.js";
import { runVideo } from "../lib/runner.js";
import type { FullConfig, VideoConfig } from "../lib/types.js";

export function collectIncludePaths(full: FullConfig): string[] {
  const paths: string[] = [];
  for (const video of full.videos) {
    const videoDir = video.configDir;
    for (const inc of video.include ?? []) {
      paths.push(resolve(videoDir, inc));
    }
  }
  return [...new Set(paths)];
}

function printResolvedConfig(
  videos: VideoConfig[],
  videoSources?: Map<string, string>,
): void {
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

  console.log(bold(`\n${videos.length} video(s):\n`));

  for (const video of videos) {
    const source = videoSources?.get(video.name);
    const label = source ? ` ${dim(`(${source})`)}` : "";
    console.log(`  ${cyan(video.name)}${label}`);
    console.log(`    url:      ${video.url}`);
    if (video.viewport)
      console.log(`    viewport: ${video.viewport.width}x${video.viewport.height}`);
    if (video.zoom) console.log(`    zoom:     ${video.zoom}x`);
    if (video.waitFor) console.log(`    waitFor:  ${video.waitFor}`);
    if (video.output) console.log(`    output:   ${video.output}`);

    console.log(`    steps:    ${video.steps.length} step(s)`);
    for (let i = 0; i < video.steps.length; i++) {
      const step = video.steps[i];
      const parts: string[] = [`${step.action}`];
      if ("text" in step && step.text && step.action !== "type")
        parts.push(`text="${step.text}"`);
      if ("selector" in step && step.selector) parts.push(`selector="${step.selector}"`);
      if ("key" in step && step.key) parts.push(`"${step.key}"`);
      if ("ms" in step && step.ms !== undefined) parts.push(`${step.ms}ms`);
      if ("url" in step && step.url && step.action === "navigate") parts.push(step.url);
      const desc =
        "description" in step && step.description ? dim(`: ${step.description}`) : "";
      console.log(`      ${dim(`${i}:`)} ${parts.join(" ")}${desc}`);
    }
    console.log();
  }
}

function accumulate(val: string, prev: string[]): string[] {
  return [...prev, val];
}

export const recordCommand = new Command("record")
  .description("Record videos")
  .argument("[videos...]", "Video names to record (default: all)")
  .option("-c, --config <path>", "Config file (repeatable)", accumulate, [])
  .option(
    "-p, --project <name>",
    "Filter by project name/glob (repeatable)",
    accumulate,
    [],
  )
  .option("--verbose", "Log each step as it executes")
  .option("--watch", "Re-record when config files change")
  .option("--dry-run", "Print the resolved config and step list without recording")
  .option("--frames", "Save raw frames as JPEGs in .webreel/frames/")
  .action(
    async (
      videoNames: string[],
      opts: {
        config: string[];
        project: string[];
        verbose?: boolean;
        watch?: boolean;
        dryRun?: boolean;
        frames?: boolean;
      },
    ) => {
      const configPaths = await resolveConfigPaths(
        opts.config.length > 0 ? opts.config : undefined,
      );
      const verbose = opts.verbose ?? false;

      const fullConfig = await loadFullConfig(configPaths);
      const videos = filterVideos(fullConfig.videos, videoNames, opts.project);

      if (opts.dryRun) {
        printResolvedConfig(videos, fullConfig.videoSources);
        return;
      }

      for (const video of videos) {
        await runVideo(video, {
          record: true,
          verbose,
          configDir: video.configDir,
          frames: opts.frames,
        });
      }

      if (opts.watch) {
        console.log("\nWatching for changes...");
        let timer: ReturnType<typeof setTimeout> | null = null;
        let recordingInProgress: Promise<void> | null = null;
        const watchers: FSWatcher[] = [];

        const closeAllWatchers = () => {
          for (const w of watchers) w.close();
          watchers.length = 0;
        };

        const setupWatchers = (full: FullConfig) => {
          closeAllWatchers();
          for (const cp of configPaths) {
            watchers.push(watch(cp, onFileChange));
          }
          for (const p of collectIncludePaths(full)) {
            watchers.push(watch(p, onFileChange));
          }
        };

        const onFileChange = () => {
          if (timer) clearTimeout(timer);

          timer = setTimeout(async () => {
            timer = null;
            console.log("\nRe-recording...");
            let latestConfig: FullConfig | null = null;
            const run = (async () => {
              try {
                latestConfig = await loadFullConfig(configPaths);
                const updatedVideos = filterVideos(
                  latestConfig.videos,
                  videoNames,
                  opts.project,
                );
                for (const video of updatedVideos) {
                  await runVideo(video, {
                    record: true,
                    verbose,
                    configDir: video.configDir,
                    frames: opts.frames,
                  });
                }
              } catch (err) {
                console.error(`Error re-recording:`, err);
              } finally {
                recordingInProgress = null;
                setupWatchers(latestConfig ?? fullConfig);
              }
            })();
            recordingInProgress = run;
            await run;
          }, 300);
        };

        setupWatchers(fullConfig);

        process.on("SIGINT", async () => {
          closeAllWatchers();
          if (recordingInProgress) {
            console.log("\nWaiting for current recording to finish...");
            await recordingInProgress;
          }
          process.exit(0);
        });
      }
    },
  );
