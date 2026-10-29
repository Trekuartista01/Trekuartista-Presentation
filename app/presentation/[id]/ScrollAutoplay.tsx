"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Auto-scroll speeds in pixels per second — tweak here.
export const AUTOSCROLL_SPEEDS = {
  slow: 40,
  medium: 90,
  fast: 180,
} as const;

type Speed = keyof typeof AUTOSCROLL_SPEEDS;

const SPEED_LABELS: Record<Speed, string> = { slow: "Ngadalë", medium: "Mesatar", fast: "Shpejt" };

// Whatever drives the page scroll (Lenis when active, native window scroll otherwise).
export type Scroller = {
  getScroll: () => number;
  getLimit: () => number;
  scrollTo: (y: number) => void;
};

const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
}

export default function ScrollAutoplay({ scroller }: { scroller: Scroller }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>("medium");
  const speedRef = useRef<number>(AUTOSCROLL_SPEEDS.medium);
  const posRef = useRef(0);
  const controlRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    speedRef.current = AUTOSCROLL_SPEEDS[speed];
  }, [speed]);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && scroller.getScroll() >= scroller.getLimit() - 1) return false;
      return !p;
    });
  }, [scroller]);

  // Drive the scroll with our own float position so slow speeds (< 1px per frame) still move.
  useEffect(() => {
    if (!playing) return;
    posRef.current = scroller.getScroll();
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      const limit = scroller.getLimit();
      posRef.current = Math.min(limit, posRef.current + speedRef.current * dt);
      scroller.scrollTo(posRef.current);
      if (posRef.current >= limit - 0.5) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Any manual scroll input pauses auto-scroll.
    const pause = (e: Event) => {
      if (e.target instanceof Node && controlRef.current?.contains(e.target)) return;
      setPlaying(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (NAV_KEYS.has(e.key)) setPlaying(false);
    };
    window.addEventListener("wheel", pause, { passive: true });
    window.addEventListener("touchstart", pause, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", pause);
      window.removeEventListener("touchstart", pause);
      window.removeEventListener("keydown", onKey);
    };
  }, [playing, scroller]);

  // Space toggles play/pause (desktop only, where the control is visible).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || isTypingTarget(e.target)) return;
      if (!window.matchMedia("(min-width: 768px)").matches) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <div ref={controlRef} className="fixed bottom-5 left-4 z-50 hidden items-center gap-1 rounded-2xl border border-white/20 bg-black/60 p-1 text-white shadow-lg backdrop-blur md:flex">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Ndal lëvizjen automatike" : "Nis lëvizjen automatike"}
        title="Space"
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-white/10 text-sm transition hover:bg-white/20"
      >
        {playing ? "❚❚" : "▶︎"}
      </button>
      {(Object.keys(AUTOSCROLL_SPEEDS) as Speed[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setSpeed(key)}
          aria-pressed={speed === key}
          className={`cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold transition ${speed === key ? "bg-indigo-500 text-white" : "text-white/75 hover:bg-white/10"}`}
        >
          {SPEED_LABELS[key]}
        </button>
      ))}
    </div>
  );
}
