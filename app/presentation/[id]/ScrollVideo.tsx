"use client";

import { useEffect, useRef, useState } from "react";
import { exitFullscreen, fullscreenSupported, getFullscreenElement, onFullscreenChange, requestElementFullscreen } from "@/lib/scroll";

type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitSupportsFullscreen?: boolean };

export default function ScrollVideo({ src, poster, width, height }: { src: string; poster?: string; width?: number; height?: number }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inViewRef = useRef(false);
  const [near, setNear] = useState(false);
  const [muted, setMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Only attach the source once the video is close to the viewport.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Play while visible, pause when scrolled away to save CPU.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !near) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
        const video = videoRef.current;
        if (!video) return;
        if (entry.isIntersecting) video.play().catch(() => {});
        else if (getFullscreenElement() !== el) video.pause();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    return onFullscreenChange(() => setIsFullscreen(getFullscreenElement() === wrapperRef.current));
  }, []);

  // iOS native fullscreen pauses the video on exit — resume if it is still on screen.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnd = () => {
      if (inViewRef.current) video.play().catch(() => {});
    };
    video.addEventListener("webkitendfullscreen", onEnd);
    return () => video.removeEventListener("webkitendfullscreen", onEnd);
  }, [near]);

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted) video.play().catch(() => {});
  };

  const enterFullscreen = () => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current as IosVideo | null;
    if (!wrapper || !video) return;
    if (isFullscreen) {
      exitFullscreen();
      return;
    }
    if (fullscreenSupported() && requestElementFullscreen(wrapper)) return;
    // iPhone Safari only supports fullscreen on the <video> element itself.
    video.webkitEnterFullscreen?.();
  };

  const hasSize = !!width && !!height;

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full ${isFullscreen ? "flex h-full items-center justify-center bg-black" : ""}`}
      style={!isFullscreen && hasSize ? { aspectRatio: `${width} / ${height}` } : undefined}
    >
      <video
        ref={videoRef}
        src={near ? src : undefined}
        poster={poster}
        width={width}
        height={height}
        muted
        loop
        playsInline
        preload={near ? "auto" : "none"}
        className={`block ${isFullscreen ? "h-full w-full object-contain" : "h-full w-full object-cover"}`}
      />
      <div className="absolute bottom-3 right-3 flex gap-2">
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? "Aktivizo zërin" : "Hiq zërin"}
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/60 text-base text-white backdrop-blur transition hover:bg-black/75"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          type="button"
          onClick={enterFullscreen}
          aria-label={isFullscreen ? "Dil nga ekrani i plotë" : "Video në ekran të plotë"}
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/60 text-lg text-white backdrop-blur transition hover:bg-black/75"
        >
          {isFullscreen ? "✕" : "⛶"}
        </button>
      </div>
    </div>
  );
}
