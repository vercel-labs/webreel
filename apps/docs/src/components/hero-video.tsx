"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export function Hero() {
  return (
    <div className="mb-12">
      <div className="text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 leading-tight mb-4">
        Record scripted browser demos as video.
      </div>
      <div className="text-base text-neutral-500 dark:text-neutral-400 mb-8">
        Define clicks, typing, and key presses in a JSON config. webreel records them in a
        headless browser with cursor animation, keystroke overlays, and sound effects.
        Output to MP4, GIF, or WebM.
      </div>
      <HeroVideo />
    </div>
  );
}

const DEMOS = [
  "/examples/videos/form-filling.mp4",
  "/examples/videos/drag-and-drop.mp4",
  "/examples/videos/keyboard-shortcuts.mp4",
  "/examples/videos/hello-world.mp4",
  "/examples/videos/modifier-clicks.mp4",
];

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
    setPlaying(true);
  }, []);

  const handleEnded = useCallback(() => {
    setCurrent((prev) => (prev + 1) % DEMOS.length);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;
    v.load();
    v.play().catch(() => {});
  }, [current, playing]);

  return (
    <div
      className="relative cursor-pointer overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-lg"
      role="button"
      tabIndex={0}
      aria-label={playing ? "Pause demo reel" : "Play demo reel"}
      onClick={() => {
        if (playing) {
          videoRef.current?.pause();
          setPlaying(false);
        } else {
          play();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (playing) {
            videoRef.current?.pause();
            setPlaying(false);
          } else {
            play();
          }
        }
      }}
    >
      <video
        ref={videoRef}
        src={DEMOS[current]}
        poster={playing ? undefined : "/examples/form-filling.png"}
        preload="auto"
        muted
        playsInline
        onEnded={handleEnded}
        className="aspect-video w-full object-cover bg-black"
      />
      {!playing && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/10 transition-opacity hover:bg-black/20"
          aria-hidden="true"
        >
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="32" fill="rgba(0,0,0,0.5)" />
            <path d="M25 19L47 32L25 45V19Z" fill="white" />
          </svg>
        </div>
      )}
      {playing && (
        <div className="absolute bottom-3 right-3 flex gap-1" aria-hidden="true">
          {DEMOS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === current ? "w-5 bg-white" : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
