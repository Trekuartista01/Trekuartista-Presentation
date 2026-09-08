"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SlideMedia = { media_url: string; media_type: "image" | "video" };

export default function PresentModeOverlay({
  media,
  title,
  startIndex = 0,
  onClose,
}: {
  media: SlideMedia[];
  title: string;
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(media.length - 1, 0)));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const total = media.length;

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (el && el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        // Fullscreen can be blocked by the browser/OS — the overlay still works without it.
      });
    }
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onClose();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, onClose]);

  const current = media[index];
  if (!current) return null;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-black">
      <button
        type="button"
        onClick={onClose}
        aria-label="Mbyll prezantimin"
        className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20"
      >
        ✕
      </button>

      <div className="relative flex h-full w-full items-center justify-center px-4 py-4">
        {current.media_type === "video" ? (
          <video key={current.media_url} src={current.media_url} controls autoPlay className="max-h-full max-w-full object-contain" />
        ) : (
          <img key={current.media_url} src={current.media_url} alt={title} className="max-h-full max-w-full object-contain" />
        )}

        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          aria-label="Slide paraardhëse"
          className="absolute left-2 top-1/2 flex h-14 w-14 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 disabled:cursor-default disabled:opacity-20 sm:left-6"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={index === total - 1}
          aria-label="Slide tjetër"
          className="absolute right-2 top-1/2 flex h-14 w-14 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20 disabled:cursor-default disabled:opacity-20 sm:right-6"
        >
          ›
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80">
        {index + 1} / {total}
      </div>
      <p className="absolute bottom-4 left-4 hidden text-[11px] text-white/40 sm:block">Esc për të mbyllur · ← → për të lëvizur</p>
    </div>
  );
}
