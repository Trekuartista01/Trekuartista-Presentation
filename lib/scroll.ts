// Helpers for the "Scroll" presentation format: settings storage, edge-colour sampling,
// PDF → page images (pdfjs-dist, in the browser) and video poster capture.

import { supabase } from "@/lib/supabase";

export type ScrollMeta = {
  source: "image" | "pdf";
  bgColor: string;
  originalUrl?: string;
  originalName?: string;
  // Keyed by media_url so admin reorder/remove in the edit modal keeps working.
  sizes: Record<string, { w: number; h: number }>;
  posters: Record<string, string>;
};

const DESIGNS_KEY = "treku_presentation_designs";

// Same localStorage map the other two formats use; Scroll entries carry `template: "scroll"`.
export function saveScrollMeta(id: string, meta: ScrollMeta) {
  const saved = localStorage.getItem(DESIGNS_KEY);
  const designsMap = saved ? (JSON.parse(saved) as Record<string, unknown>) : {};
  designsMap[id] = { template: "scroll", layoutCols: 1, scroll: meta };
  localStorage.setItem(DESIGNS_KEY, JSON.stringify(designsMap));
}

function normalizeScrollMeta(meta: ScrollMeta): ScrollMeta {
  return { ...meta, sizes: meta.sizes ?? {}, posters: meta.posters ?? {} };
}

export function loadScrollMeta(id: string): ScrollMeta | null {
  try {
    const saved = localStorage.getItem(DESIGNS_KEY);
    if (!saved) return null;
    const picked = (JSON.parse(saved) as Record<string, { template?: string; scroll?: ScrollMeta }>)[id];
    if (picked?.template !== "scroll" || !picked.scroll) return null;
    return normalizeScrollMeta(picked.scroll);
  } catch {
    return null;
  }
}

// localStorage only exists in the admin's browser, so the settings are also published as a JSON
// file next to the presentation's media in the storage bucket, where every viewer can read them.
function scrollMetaPath(id: string) {
  return `${id}/scroll-meta.json`;
}

export async function publishScrollMeta(id: string, meta: ScrollMeta): Promise<boolean> {
  const body = new Blob([JSON.stringify(meta)], { type: "application/json" });
  const bucket = supabase.storage.from("presentations");
  const { error } = await bucket.upload(scrollMetaPath(id), body, { upsert: true, contentType: "application/json", cacheControl: "60" });
  if (!error) return true;
  // Upsert also needs an UPDATE policy; a plain insert still works the first time.
  const retry = await bucket.upload(scrollMetaPath(id), body, { upsert: false, contentType: "application/json", cacheControl: "60" });
  return !retry.error;
}

export async function fetchScrollMeta(id: string): Promise<ScrollMeta | null> {
  try {
    const url = supabase.storage.from("presentations").getPublicUrl(scrollMetaPath(id)).data.publicUrl;
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const meta = (await res.json()) as ScrollMeta;
    return meta?.source ? normalizeScrollMeta(meta) : null;
  } catch {
    return null;
  }
}

function toHex(n: number) {
  return Math.round(n).toString(16).padStart(2, "0");
}

// Dominant colour of the outer left/right pixel columns. Pixels are bucketed (4 bits per channel)
// and the most common bucket is averaged, so a few busy edge areas don't muddy the result.
export function sampleEdgeColor(source: CanvasImageSource, width: number, height: number): string {
  const sampleW = Math.min(width, 120);
  const sampleH = Math.max(1, Math.min(4096, Math.round((height * sampleW) / width)));
  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#000000";
  ctx.drawImage(source, 0, 0, sampleW, sampleH);

  const edge = Math.max(1, Math.round(sampleW * 0.03));
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  const add = (data: Uint8ClampedArray) => {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
      bucket.r += data[i];
      bucket.g += data[i + 1];
      bucket.b += data[i + 2];
      bucket.n += 1;
      buckets.set(key, bucket);
    }
  };
  add(ctx.getImageData(0, 0, edge, sampleH).data);
  add(ctx.getImageData(sampleW - edge, 0, edge, sampleH).data);

  let best: { r: number; g: number; b: number; n: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.n > best.n) best = bucket;
  }
  if (!best) return "#000000";
  return `#${toHex(best.r / best.n)}${toHex(best.g / best.n)}${toHex(best.b / best.n)}`;
}

export async function readImage(file: File): Promise<{ width: number; height: number; color: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Imazhi nuk u lexua."));
      el.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, color: sampleEdgeColor(img, img.naturalWidth, img.naturalHeight) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type RenderedPage = { file: File; width: number; height: number };

// 2x the 1400px display width so pages stay sharp on retina screens.
export const PDF_RENDER_WIDTH = 2800;

export async function renderPdfToImages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pages: RenderedPage[]; color: string }> {
  // Imported lazily: pdfjs touches browser-only globals at import time.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await loadingTask.promise;
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const pages: RenderedPage[] = [];
  let color = "#000000";
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const unscaled = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PDF_RENDER_WIDTH / unscaled.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      if (n === 1) color = sampleEdgeColor(canvas, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Konvertimi i faqes dështoi."))), "image/jpeg", 0.88),
      );
      pages.push({
        file: new File([blob], `${baseName}-page-${String(n).padStart(3, "0")}.jpg`, { type: "image/jpeg", lastModified: Date.now() }),
        width: canvas.width,
        height: canvas.height,
      });
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      onProgress?.(n, doc.numPages);
    }
  } finally {
    await loadingTask.destroy();
  }
  return { pages, color };
}

// Grabs an early frame as a JPEG poster and reads the video's dimensions. Never throws.
export async function captureVideoPoster(file: File): Promise<{ poster: File | null; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("timeout")), 10000);
      video.onloadeddata = () => {
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
      };
      video.onseeked = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("video error"));
      };
      video.src = url;
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx || !width || !height) return { poster: null, width, height };
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    const poster = blob ? new File([blob], `${file.name.replace(/\.[^/.]+$/, "")}-poster.jpg`, { type: "image/jpeg" }) : null;
    return { poster, width, height };
  } catch {
    return { poster: null, width: video.videoWidth || 0, height: video.videoHeight || 0 };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export const SCROLL_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const SCROLL_VIDEO_TYPES = ["video/mp4", "video/webm"];

// Fullscreen API with the webkit-prefixed fallback (older Safari).
type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function getFullscreenElement(): Element | null {
  const d = document as WebkitDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function fullscreenSupported(): boolean {
  const d = document as WebkitDocument;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function requestElementFullscreen(el: HTMLElement): boolean {
  const w = el as WebkitElement;
  if (w.requestFullscreen) {
    w.requestFullscreen().catch(() => {});
    return true;
  }
  if (w.webkitRequestFullscreen) {
    void w.webkitRequestFullscreen();
    return true;
  }
  return false;
}

export function exitFullscreen() {
  const d = document as WebkitDocument;
  if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
  else if (d.webkitExitFullscreen) void d.webkitExitFullscreen();
}

export function onFullscreenChange(handler: () => void): () => void {
  document.addEventListener("fullscreenchange", handler);
  document.addEventListener("webkitfullscreenchange", handler);
  return () => {
    document.removeEventListener("fullscreenchange", handler);
    document.removeEventListener("webkitfullscreenchange", handler);
  };
}
