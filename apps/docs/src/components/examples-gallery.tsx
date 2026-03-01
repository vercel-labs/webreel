"use client";

import { useRef, useState, useCallback, useEffect } from "react";

const examples = [
  {
    name: "hello-world",
    description: "Minimal setup that opens a page and clicks a button.",
    video: "/examples/videos/hello-world.mp4",
  },
  {
    name: "form-filling",
    description: "Types into fields with realistic timing and submits a login form.",
    video: "/examples/videos/form-filling.mp4",
  },
  {
    name: "keyboard-shortcuts",
    description: "Presses key combos and displays them in the keystroke HUD.",
    video: "/examples/videos/keyboard-shortcuts.mp4",
  },
  {
    name: "drag-and-drop",
    description: "Drags cards between columns on a kanban board.",
    video: "/examples/videos/drag-and-drop.mp4",
  },
  {
    name: "page-scrolling",
    description: "Scrolls a page and within a sidebar container.",
    video: "/examples/videos/page-scrolling.mp4",
  },
  {
    name: "screenshots",
    description: "Captures PNG screenshots at different points during a recording.",
    video: "/examples/videos/screenshots.mp4",
  },
  {
    name: "gif-output",
    description: "Produces an animated GIF instead of the default MP4.",
    video: "/examples/videos/gif-output.gif",
  },
  {
    name: "webm-output",
    description: "Produces a WebM video using VP9 encoding.",
    video: "/examples/videos/webm-output.webm",
  },
  {
    name: "custom-theme",
    description: "Customizes cursor SVG, size, and HUD appearance.",
    video: "/examples/videos/custom-theme.mp4",
  },
  {
    name: "mobile-viewport",
    description: "Records at mobile dimensions with Retina scaling.",
    video: "/examples/videos/mobile-viewport.mp4",
  },
  {
    name: "multi-demo",
    description: "Multiple demos in one config, each producing its own video.",
    video: "/examples/videos/multi-demo.mp4",
  },
  {
    name: "shared-steps",
    description: "Reusable setup steps via include that run before every demo.",
    video: "/examples/videos/shared-steps.mp4",
  },
  {
    name: "modifier-clicks",
    description: "Clicks with Cmd and Shift held down for multi-select.",
    video: "/examples/videos/modifier-clicks.mp4",
  },
];

const GITHUB_BASE = "https://github.com/vercel-labs/webreel/tree/main/examples";

function PlayIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill="rgba(0,0,0,0.6)" />
      <path d="M19 15L35 24L19 33V15Z" fill="white" />
    </svg>
  );
}

function ExampleCard({
  example,
  playing,
  onPlay,
}: {
  example: (typeof examples)[number];
  playing: boolean;
  onPlay: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isGif = example.video.endsWith(".gif");

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [playing]);

  const handleClick = useCallback(() => {
    if (isGif) return;
    onPlay();
  }, [onPlay, isGif]);

  const handleEnded = useCallback(() => {
    onPlay();
  }, [onPlay]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <div>
      <div
        role={isGif ? undefined : "button"}
        tabIndex={isGif ? undefined : 0}
        aria-label={isGif ? undefined : `Play ${example.name} demo video`}
        className="relative cursor-pointer overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
        onClick={handleClick}
        onKeyDown={isGif ? undefined : handleKeyDown}
      >
        {isGif ? (
          <img
            src={example.video}
            alt={`${example.name} demo`}
            className="aspect-video w-full object-cover"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              src={example.video}
              poster={`/examples/${example.name}.png`}
              preload="none"
              muted
              playsInline
              onEnded={handleEnded}
              className="aspect-video w-full object-cover"
            />
            {!playing && (
              <div
                className="absolute inset-0 flex items-center justify-center transition-opacity hover:opacity-80"
                aria-hidden="true"
              >
                <PlayIcon />
              </div>
            )}
          </>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {example.name}
        </p>
        <a
          href={`${GITHUB_BASE}/${example.name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          Source
        </a>
      </div>
      <p className="text-[13px] text-neutral-500 dark:text-neutral-400">
        {example.description}
      </p>
    </div>
  );
}

export function ExamplesGallery() {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  const handlePlay = useCallback((name: string) => {
    setActiveVideo((prev) => (prev === name ? null : name));
  }, []);

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {examples.map((ex) => (
        <ExampleCard
          key={ex.name}
          example={ex}
          playing={activeVideo === ex.name}
          onPlay={() => handlePlay(ex.name)}
        />
      ))}
    </div>
  );
}
