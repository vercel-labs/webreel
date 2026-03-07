import { Command } from "commander";
import { loadFullConfig, resolveConfigPaths, filterVideos } from "../lib/config.js";

function accumulate(val: string, prev: string[]): string[] {
  return [...prev, val];
}

export const listCommand = new Command("list")
  .description("List all videos across config(s)")
  .option("-c, --config <path>", "Config file (repeatable)", accumulate, [])
  .option(
    "-p, --project <name>",
    "Filter by project name/glob (repeatable)",
    accumulate,
    [],
  )
  .option("--json", "Output as JSON")
  .action(async (opts: { config: string[]; project: string[]; json?: boolean }) => {
    const configPaths = await resolveConfigPaths(
      opts.config.length > 0 ? opts.config : undefined,
    );
    const fullConfig = await loadFullConfig(configPaths);
    const videos = filterVideos(fullConfig.videos, [], opts.project);

    if (opts.json) {
      const data = videos.map((v) => ({
        name: v.name,
        url: v.url,
        source: fullConfig.videoSources.get(v.name) ?? null,
        steps: v.steps.length,
        viewport: v.viewport ?? null,
        output: v.output ?? null,
      }));
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
    const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

    console.log(`\n${videos.length} video(s):\n`);

    for (const video of videos) {
      const source = fullConfig.videoSources.get(video.name);
      const sourceLabel = source ? dim(` (${source})`) : "";
      const viewport = video.viewport
        ? dim(` ${video.viewport.width}x${video.viewport.height}`)
        : "";
      const steps = dim(` ${video.steps.length} step(s)`);

      console.log(`  ${cyan(video.name)}${sourceLabel}`);
      console.log(`    ${video.url}${viewport}${steps}`);
    }

    console.log();
  });
