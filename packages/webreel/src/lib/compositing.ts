import { ensureFfmpeg, extractThumbnail } from "@webreel/core";
import {
  buildAutoZoomFilter,
  compose,
  type AutoZoomConfig,
  type TimelineData,
  type ZoomEvent,
} from "@webreel/core";
import type { VideoConfig } from "./types.js";

export function normalizeAutoZoom(value: VideoConfig["autoZoom"]): AutoZoomConfig {
  if (value === true) return { enabled: true };
  if (value === false || value === undefined) return { enabled: false };
  return { ...value, enabled: value.enabled ?? true };
}

export async function extractThumbnailIfConfigured(
  config: Pick<VideoConfig, "thumbnail">,
  outputPath: string,
): Promise<void> {
  if (config.thumbnail?.enabled === false) return;
  const thumbTime = config.thumbnail?.time ?? 0;
  const thumbPath = outputPath.replace(/\.[^.]+$/, ".png");
  const ffmpegPath = await ensureFfmpeg();
  extractThumbnail(ffmpegPath, outputPath, thumbPath, thumbTime);
  console.log(`Thumbnail: ${thumbPath}`);
}

export interface CompositeRecordingOptions {
  rawVideoPath: string;
  timelineData: TimelineData;
  outputPath: string;
  video: Pick<VideoConfig, "autoZoom" | "sfx" | "thumbnail">;
  zoomEvents: ZoomEvent[];
  verbose: boolean;
}

/**
 * Shared compositing orchestration used by both `runVideo` (fresh recording)
 * and the `composite` command (re-composite from stored raw video +
 * timeline). Builds the autozoom filter (if enabled and events are
 * available), composes the final output, then extracts the thumbnail.
 */
export async function compositeRecording(opts: CompositeRecordingOptions): Promise<void> {
  const { rawVideoPath, timelineData, outputPath, video, zoomEvents, verbose } = opts;

  const autoZoomCfg = normalizeAutoZoom(video.autoZoom);
  const zoomFilter = autoZoomCfg.enabled
    ? buildAutoZoomFilter(
        zoomEvents,
        { width: timelineData.width, height: timelineData.height },
        timelineData.zoom ?? 1,
        timelineData.fps,
        autoZoomCfg,
      )
    : null;
  if (zoomFilter) {
    console.log(
      `Applying autozoom (${zoomEvents.length} event${zoomEvents.length === 1 ? "" : "s"})`,
    );
    if (verbose) {
      for (const e of zoomEvents) {
        const box = e.box;
        console.log(
          `  t=${(e.timeMs / 1000).toFixed(2)}s box=${box.x.toFixed(0)},${box.y.toFixed(0)} ${box.width.toFixed(0)}x${box.height.toFixed(0)}`,
        );
      }
    }
  }

  await compose(rawVideoPath, timelineData, outputPath, {
    sfx: video.sfx,
    zoomFilter: zoomFilter ?? undefined,
  });

  await extractThumbnailIfConfigured(video, outputPath);
}
