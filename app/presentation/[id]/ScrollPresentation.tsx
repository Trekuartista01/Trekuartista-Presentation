"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import {
  ScrollMeta,
  exitFullscreen,
  fullscreenSupported,
  getFullscreenElement,
  onFullscreenChange,
  requestElementFullscreen,
} from "@/lib/scroll";
import ScrollAutoplay, { Scroller } from "./ScrollAutoplay";
import ScrollVideo from "./ScrollVideo";

type ScrollMedia = { media_url: string; media_type: "image" | "video"; sort_order: number };

// Fades (and optionally slides) a section in once when it enters the viewport.
// prefers-reduced-motion users get it visible straight away via the motion-reduce variants.
function Reveal({ children, slide }: { children: ReactNode; slide: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // threshold 0 + bottom margin: a very tall image can never reach a meaningful intersection ratio.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-[900ms] ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
        shown ? "translate-y-0 opacity-100" : `opacity-0 ${slide ? "translate-y-8" : ""}`
      }`}
    >
      {children}
    </div>
  );
}

function isLightColor(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

export default function ScrollPresentation({
  item,
  meta,
}: {
  item: { id: string; title: string; media: ScrollMedia[] };
  meta: ScrollMeta;
}) {
  const lenisRef = useRef<Lenis | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const sectionsRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<{ index: number; ratio: number }>({ index: 0, ratio: 0 });
  const anchorLockUntil = useRef(0);
  const pageFullscreenRef = useRef(false);
  const [pageFullscreen, setPageFullscreen] = useState(false);
  const [exitedFullscreen, setExitedFullscreen] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [toast, setToast] = useState("");

  const light = isLightColor(meta.bgColor);
  const buttonClass = light
    ? "border-black/15 bg-black/5 text-black hover:bg-black/10"
    : "border-white/20 bg-white/10 text-white hover:bg-white/20";

  const scroller = useMemo<Scroller>(
    () => ({
      getScroll: () => lenisRef.current?.scroll ?? window.scrollY,
      getLimit: () => lenisRef.current?.limit ?? document.documentElement.scrollHeight - window.innerHeight,
      scrollTo: (y) => {
        if (lenisRef.current) lenisRef.current.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      },
    }),
    [],
  );

  // Page-level side effects: page colour behind overscroll, hide the global scroll-to-top button.
  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = meta.bgColor;
    document.body.dataset.format = "scroll";
    // Feature detection has to run on the client; SSR has no `document`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanFullscreen(fullscreenSupported());
    return () => {
      document.body.style.backgroundColor = prevBg;
      delete document.body.dataset.format;
    };
  }, [meta.bgColor]);

  // Smooth scrolling (skipped for prefers-reduced-motion → native scroll).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true });
    lenisRef.current = lenis;
    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const captureAnchor = useCallback(() => {
    const container = sectionsRef.current;
    if (!container) return;
    const children = Array.from(container.children) as HTMLElement[];
    for (let i = 0; i < children.length; i += 1) {
      const rect = children[i].getBoundingClientRect();
      if (rect.bottom > 0) {
        anchorRef.current = { index: i, ratio: rect.height > 0 ? Math.max(0, -rect.top) / rect.height : 0 };
        return;
      }
    }
  }, []);

  const restoreAnchor = useCallback(() => {
    const container = sectionsRef.current;
    const target = container?.children[anchorRef.current.index] as HTMLElement | undefined;
    if (!target) return;
    lenisRef.current?.resize();
    const y = target.getBoundingClientRect().top + window.scrollY + anchorRef.current.ratio * target.offsetHeight;
    scroller.scrollTo(y);
  }, [scroller]);

  // Progress bar, back-to-top visibility and the scroll anchor used to keep position across fullscreen.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      const progress = limit > 0 ? Math.min(1, Math.max(0, window.scrollY / limit)) : 0;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress})`;
      const down = window.scrollY > window.innerHeight * 1.5;
      setScrolledDown(down);
      if (window.scrollY < 40) setExitedFullscreen(false);
      if (performance.now() > anchorLockUntil.current) captureAnchor();
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // A resize (e.g. entering fullscreen) reflows the page; don't overwrite the anchor mid-reflow.
    const onResize = () => {
      anchorLockUntil.current = performance.now() + 400;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [captureAnchor]);

  // fullscreenchange covers the button, ESC and any other way out.
  useEffect(() => {
    return onFullscreenChange(() => {
      const el = getFullscreenElement();
      anchorLockUntil.current = performance.now() + 400;
      if (el === document.documentElement) {
        pageFullscreenRef.current = true;
        setPageFullscreen(true);
      } else if (!el && pageFullscreenRef.current) {
        pageFullscreenRef.current = false;
        setPageFullscreen(false);
        setExitedFullscreen(true);
      }
      // A single video going fullscreen leaves the page mode as it was.
      requestAnimationFrame(() => requestAnimationFrame(restoreAnchor));
      window.setTimeout(restoreAnchor, 350);
    });
  }, [restoreAnchor]);

  const toggleFullscreen = () => {
    captureAnchor();
    anchorLockUntil.current = performance.now() + 400;
    if (pageFullscreen) exitFullscreen();
    else requestElementFullscreen(document.documentElement);
  };

  const backToTop = () => {
    if (lenisRef.current) lenisRef.current.scrollTo(0, { duration: 1.2 });
    else window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const nav = navigator as Navigator & { share?: (data: { title?: string; url?: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: item.title, url });
        return;
      } catch {
        // user cancelled the native share sheet — fall back to copying the link
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Lidhja u kopjua në clipboard!");
    } catch {
      window.prompt("Kopjo lidhjen e prezantimit:", url);
    }
  };

  const originalUrl = meta.originalUrl ?? item.media.find((m) => m.media_type === "image")?.media_url;
  const slideImages = meta.source === "pdf";

  return (
    <main className="min-h-screen" style={{ backgroundColor: meta.bgColor }}>
      {!pageFullscreen ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
          <div ref={progressRef} className="h-full origin-left bg-indigo-500" style={{ transform: "scaleX(0)" }} />
        </div>
      ) : null}

      {!pageFullscreen ? (
        <header className={`mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-3 py-3 ${light ? "text-black" : "text-white"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className={`inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border text-base font-semibold transition ${buttonClass}`}
              aria-label="Kthehu"
            >
              ←
            </button>
            <h1 className="truncate text-base font-semibold sm:text-lg">{item.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleShare} className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition sm:text-sm ${buttonClass}`}>
              🔗 Shpërndaj
            </button>
            {originalUrl ? (
              <a
                href={originalUrl}
                target="_blank"
                rel="noreferrer"
                download={meta.originalName}
                className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition sm:text-sm ${buttonClass}`}
              >
                ⬇️ {meta.source === "pdf" ? "PDF origjinal" : "Imazhi origjinal"}
              </a>
            ) : null}
          </div>
        </header>
      ) : null}

      <div ref={sectionsRef} className={`mx-auto w-full ${pageFullscreen ? "max-w-none" : "max-w-[1400px]"}`}>
        {item.media.map((m, index) => {
          const size = meta.sizes[m.media_url];
          return (
            <Reveal key={`${m.media_url}-${index}`} slide={m.media_type === "video" || slideImages}>
              {m.media_type === "video" ? (
                <ScrollVideo src={m.media_url} poster={meta.posters[m.media_url]} width={size?.w} height={size?.h} />
              ) : (
                <img
                  src={m.media_url}
                  alt={`${item.title} ${index + 1}`}
                  width={size?.w}
                  height={size?.h}
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                  decoding="async"
                  className="block h-auto w-full"
                />
              )}
            </Reveal>
          );
        })}
      </div>

      <ScrollAutoplay scroller={scroller} />

      {!pageFullscreen ? (
        <div className="fixed bottom-5 right-4 z-50 flex items-center gap-2">
          {exitedFullscreen || scrolledDown ? (
            <button
              type="button"
              onClick={backToTop}
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/25 bg-black/60 px-4 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:scale-105 hover:bg-black/75"
            >
              ↑ Në fillim
            </button>
          ) : null}
          {canFullscreen ? (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Ekran i plotë"
              title="Ekran i plotë"
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/25 bg-black/60 px-4 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:scale-105 hover:bg-black/75"
            >
              ⛶ <span className="hidden sm:inline">Ekran i plotë</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black shadow-lg">{toast}</div>
      ) : null}
    </main>
  );
}
