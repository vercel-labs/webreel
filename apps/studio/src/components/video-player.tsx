"use client";

import { useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface VideoPlayerProps {
  src: string;
  onClose: () => void;
}

export function VideoPlayer({ src, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const frameStep = (frames: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setPlaying(false);
    video.currentTime = Math.max(0, Math.min(video.currentTime + frames / 60, duration));
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">Playback</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" asChild>
            <a href={src} download title="Download">
              <Download className="size-3" />
            </a>
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close player">
            <X className="size-3" />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-4">
        <video
          ref={videoRef}
          src={src}
          className="max-h-full max-w-full rounded"
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
          onEnded={() => setPlaying(false)}
        />
      </div>
      <div className="flex shrink-0 flex-col gap-1 border-t px-3 py-2">
        <Slider
          min={0}
          max={duration || 1}
          step={0.01}
          value={[currentTime]}
          onValueChange={([v]) => seekTo(v)}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => frameStep(-1)}
            title="Previous frame"
          >
            <SkipBack className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={togglePlay}>
            {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => frameStep(1)}
            title="Next frame"
          >
            <SkipForward className="size-3" />
          </Button>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
