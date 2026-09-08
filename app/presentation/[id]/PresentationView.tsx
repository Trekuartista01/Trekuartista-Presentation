"use client";

import { useEffect, useState } from "react";
import { createZip } from "@/lib/zip";
import { createPdfFromJpegImages } from "@/lib/pdf";
import PresentModeOverlay from "@/app/components/PresentModeOverlay";

type PresentationData = {
  id: string;
  title: string;
  description: string;
  is_pinned: boolean;
  media: { media_url: string; media_type: "image" | "video"; sort_order: number }[];
};

type FetchState = "loading" | "not_found" | "locked" | "ok";

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "prezantimi";
}

function filenameFromUrl(url: string): string {
  try {
    const clean = url.split("?")[0];
    const last = clean.substring(clean.lastIndexOf("/") + 1);
    return decodeURIComponent(last) || "file";
  } catch {
    return "file";
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function sessionKeyFor(id: string): string {
  return `treku_pw_${id}`;
}

export default function PresentationView({ id }: { id: string }) {
  const [state, setState] = useState<FetchState>("loading");
  const [item, setItem] = useState<PresentationData | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [checkingPassword, setCheckingPassword] = useState(false);

  const [template, setTemplate] = useState<"classic" | "social">("classic");
  const [layoutCols, setLayoutCols] = useState<1 | 3>(1);
  const [socialMediaWidth, setSocialMediaWidth] = useState<"card" | "full">("card");
  const [featuredFullWidth, setFeaturedFullWidth] = useState(false);
  const [featuredPosition, setFeaturedPosition] = useState<"top" | "bottom">("top");
  const [featuredCount, setFeaturedCount] = useState(0);
  const [customText, setCustomText] = useState("");
  const [mediaTexts, setMediaTexts] = useState<string[]>([]);

  const [presenting, setPresenting] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<"pdf" | "zip" | null>(null);
  const [toast, setToast] = useState("");

  const applySavedDesign = (data: PresentationData) => {
    const savedDesigns = localStorage.getItem("treku_presentation_designs");
    if (!savedDesigns) return;
    try {
      const designsMap = JSON.parse(savedDesigns) as Record<
        string,
        {
          template: "classic" | "social";
          layoutCols: 1 | 3;
          socialMediaWidth?: "card" | "full";
          featuredFullWidth?: boolean;
          featuredPosition?: "top" | "bottom";
          featuredCount?: number;
          customText?: string;
          mediaTexts?: string[];
        }
      >;
      const picked = designsMap[data.id];
      if (picked) {
        setTemplate(picked.template);
        setLayoutCols(picked.layoutCols);
        setSocialMediaWidth(picked.socialMediaWidth ?? "card");
        setFeaturedFullWidth(!!picked.featuredFullWidth);
        setFeaturedPosition(picked.featuredPosition ?? "top");
        setFeaturedCount(picked.featuredCount ?? 0);
        setCustomText(picked.customText ?? "");
        setMediaTexts(picked.mediaTexts ?? []);
      }
    } catch {
      // ignore malformed local design cache
    }
  };

  const fetchPresentation = async (password?: string) => {
    const res = await fetch(`/api/presentation/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(password ? { password } : {}),
    });
    if (res.status === 404) {
      setState("not_found");
      return;
    }
    if (res.status === 401) {
      setState("locked");
      return;
    }
    const json = await res.json();
    const data = json.presentation as PresentationData;
    setItem(data);
    applySavedDesign(data);
    setState("ok");
    if (password) {
      try {
        sessionStorage.setItem(sessionKeyFor(id), password);
      } catch {
        // sessionStorage can be unavailable (private mode); unlocking still works for this load
      }
    }
  };

  useEffect(() => {
    const load = async () => {
      let savedPassword: string | null = null;
      try {
        savedPassword = sessionStorage.getItem(sessionKeyFor(id));
      } catch {
        savedPassword = null;
      }
      await fetchPresentation(savedPassword ?? undefined);
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setCheckingPassword(true);
    setPasswordError("");
    try {
      const res = await fetch(`/api/presentation/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput.trim() }),
      });
      if (res.status === 401) {
        setPasswordError("Fjalëkalim i pasaktë.");
        return;
      }
      if (res.status === 404) {
        setState("not_found");
        return;
      }
      const json = await res.json();
      const data = json.presentation as PresentationData;
      setItem(data);
      applySavedDesign(data);
      setState("ok");
      try {
        sessionStorage.setItem(sessionKeyFor(id), passwordInput.trim());
      } catch {
        // ignore
      }
    } catch {
      setPasswordError("Diçka shkoi keq. Provo përsëri.");
    } finally {
      setCheckingPassword(false);
    }
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const shareTitle = item?.title ?? "Prezantimi";
    const nav = navigator as Navigator & { share?: (data: { title?: string; url?: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: shareTitle, url });
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

  const handleDownloadOriginals = async () => {
    if (!item) return;
    const mediaList = item.media ?? [];
    if (mediaList.length === 0) {
      showToast("Ky prezantim s'ka asnjë file.");
      setDownloadMenuOpen(false);
      return;
    }
    setDownloadBusy("zip");
    setDownloadMenuOpen(false);
    try {
      if (mediaList.length === 1) {
        const res = await fetch(mediaList[0].media_url);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        triggerBlobDownload(blob, filenameFromUrl(mediaList[0].media_url));
        return;
      }
      const used = new Set<string>();
      const files: { name: string; data: Uint8Array }[] = [];
      for (const m of mediaList) {
        const res = await fetch(m.media_url);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        const buf = new Uint8Array(await blob.arrayBuffer());
        let name = filenameFromUrl(m.media_url);
        if (used.has(name)) {
          const dot = name.lastIndexOf(".");
          const base = dot >= 0 ? name.slice(0, dot) : name;
          const ext = dot >= 0 ? name.slice(dot) : "";
          name = `${base}-${used.size}${ext}`;
        }
        used.add(name);
        files.push({ name, data: buf });
      }
      const zipBlob = createZip(files);
      triggerBlobDownload(zipBlob, `${sanitizeFilename(item.title)}.zip`);
    } catch {
      showToast("Shkarkimi dështoi. Provo përsëri.");
    } finally {
      setDownloadBusy(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!item) return;
    const images = (item.media ?? []).filter((m) => m.media_type === "image");
    if (images.length === 0) {
      showToast("Ky prezantim s'ka imazhe për ta bërë PDF.");
      setDownloadMenuOpen(false);
      return;
    }
    setDownloadBusy("pdf");
    setDownloadMenuOpen(false);
    try {
      const converted: { bytes: Uint8Array; widthPx: number; heightPx: number }[] = [];
      for (const m of images) {
        const res = await fetch(m.media_url);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.drawImage(bitmap, 0, 0);
        const jpegBlob: Blob = await new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9),
        );
        const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
        converted.push({ bytes, widthPx: canvas.width, heightPx: canvas.height });
      }
      const pdfBlob = await createPdfFromJpegImages(converted);
      triggerBlobDownload(pdfBlob, `${sanitizeFilename(item.title)}.pdf`);
    } catch {
      showToast("Krijimi i PDF dështoi. Provo përsëri.");
    } finally {
      setDownloadBusy(null);
    }
  };

  if (state === "loading") {
    return (
      <main className="p-6 lg:p-16 text-white">
        <div className="mx-auto grid h-auto w-full grid-cols-1 gap-6">
          <div className="rounded-3xl bg-white/5 p-5 lg:p-10 backdrop-blur-xl">
            <div className="mb-5 space-y-3">
              <div className="h-10 w-2/3 animate-pulse rounded bg-white/10 lg:h-14" />
              <div className="h-5 w-28 animate-pulse rounded-full bg-white/10" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`single-skeleton-${index}`} className="h-56 animate-pulse rounded-2xl bg-white/10 lg:h-[35vh]" />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (state === "not_found") {
    return <main className="min-h-screen bg-linear-to-b from-black via-[#050b14] to-[#000000] p-6 text-white">Prezantimi nuk u gjet.</main>;
  }

  if (state === "locked") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-linear-to-b from-black via-[#050b14] to-[#000000] p-6 text-white">
        <div className="w-full max-w-[420px] rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-xl">
          <p className="mb-2 text-3xl">🔒</p>
          <h1 className="mb-2 text-xl font-bold">Ky prezantim kërkon fjalëkalim</h1>
          <p className="mb-5 text-sm text-white/70">Vendos fjalëkalimin që të mund ta shikosh këtë prezantim.</p>
          <form onSubmit={submitPassword} className="space-y-3">
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Fjalëkalimi"
              className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-center outline-none"
            />
            {passwordError ? <p className="text-sm text-red-300">{passwordError}</p> : null}
            <button
              disabled={checkingPassword}
              className="w-full cursor-pointer rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60"
            >
              {checkingPassword ? "Duke kontrolluar…" : "Hap prezantimin"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (!item) return null;

  if (item.is_pinned) {
    return (
      <main className="min-h-screen bg-linear-to-b from-black via-[#050b14] to-[#000000] p-6 lg:p-16 text-white">
        <div className="mx-auto max-w-[900px] rounded-3xl border border-amber-300/30 bg-amber-500/10 p-8 text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-amber-200">🔑 Pinned</p>
          <h1 className="text-2xl font-bold lg:text-4xl">{item.title}</h1>
          <p className="mt-3 text-sm text-white/80">Ky prezantim është i bllokuar dhe nuk mund të shikohet.</p>
        </div>
      </main>
    );
  }

  const links = item.description.match(/https?:\/\/[^\s]+/g) ?? [];
  const hasCustomText = customText.trim().length > 0;
  const hasLinks = links.length > 0;
  const mediaGridClass = layoutCols === 1 ? "grid-cols-1" : "grid-cols-3";
  const media = item.media ?? [];
  const activeFeaturedCount =
    template === "social" && layoutCols === 3 && featuredFullWidth ? Math.min(Math.max(featuredCount, 0), media.length) : 0;
  const featuredMedia = media.slice(0, activeFeaturedCount);
  const gridMedia = media.slice(activeFeaturedCount);
  const featuredTexts = mediaTexts.slice(0, activeFeaturedCount);
  const gridTexts = mediaTexts.slice(activeFeaturedCount);

  return (
    <main className="p-2 lg:p-16 text-white">
      <div className="mx-auto grid h-auto w-full grid-cols-1 gap-6">
        <div className="rounded-3xl bg-white/5 p-5 lg:p-10 backdrop-blur-xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-white/10 text-base font-semibold text-white transition hover:bg-white/20"
              aria-label="Kthehu"
            >
              ←
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {media.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setPresenting(true)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 sm:text-sm"
                >
                  🖥️ Paraqit si prezantim
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 sm:text-sm"
              >
                🔗 Shpërndaj
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDownloadMenuOpen((v) => !v)}
                  disabled={downloadBusy !== null}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-wait disabled:opacity-60 sm:text-sm"
                >
                  {downloadBusy ? "Duke përgatitur…" : "⬇️ Shkarko"}
                </button>
                {downloadMenuOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#0b0f1a] text-left shadow-2xl">
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="block w-full cursor-pointer px-4 py-3 text-left text-sm text-white transition hover:bg-white/10"
                    >
                      Si PDF
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadOriginals}
                      className="block w-full cursor-pointer px-4 py-3 text-left text-sm text-white transition hover:bg-white/10"
                    >
                      Filet origjinale {media.length > 1 ? "(ZIP)" : ""}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="mb-5">
            <h1 className="text-3xl lg:text-5xl font-bold mb-6 lg:mb-10">{item.title}</h1>
          </div>
          {featuredPosition === "top" && featuredMedia.length > 0 ? (
            <div className="mb-4 space-y-4">
              {featuredMedia.map((m, index) => (
                <div key={`${m.media_url}-${index}`}>
                  {m.media_type === "video" ? (
                    <video src={m.media_url} autoPlay loop muted playsInline controls className={`h-auto w-full ${template === "social" && socialMediaWidth === "card" ? "rounded-xl" : ""}`} />
                  ) : (
                    <img src={m.media_url} alt={item.title} className={`h-auto w-full object-cover ${template === "social" && socialMediaWidth === "card" ? "rounded-xl" : ""}`} />
                  )}
                  {template === "social" && (featuredTexts[index] ?? "").trim().length > 0 ? <p className="mt-2 text-sm text-white/80">{featuredTexts[index]}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className={`grid h-auto gap-4 ${mediaGridClass}`}>
            {gridMedia.map((m, index) =>
              m.media_type === "video" ? (
                <div key={`${m.media_url}-${index}`}>
                  <video src={m.media_url} autoPlay loop muted playsInline controls className={`h-auto w-full ${template === "social" && socialMediaWidth === "card" ? "rounded-xl" : ""}`} />
                  {template === "social" && (gridTexts[index] ?? "").trim().length > 0 ? <p className="mt-2 text-sm text-white/80">{gridTexts[index]}</p> : null}
                </div>
              ) : (
                <div key={`${m.media_url}-${index}`}>
                  <img src={m.media_url} alt={item.title} className={`h-auto w-full object-cover ${template === "social" && socialMediaWidth === "card" ? "rounded-xl" : ""}`} />
                  {template === "social" && (gridTexts[index] ?? "").trim().length > 0 ? <p className="mt-2 text-sm text-white/80">{gridTexts[index]}</p> : null}
                </div>
              ),
            )}
          </div>
          {featuredPosition === "bottom" && featuredMedia.length > 0 ? (
            <div className="mt-4 space-y-4">
              {featuredMedia.map((m, index) => (
                <div key={`${m.media_url}-${index}`}>
                  {m.media_type === "video" ? (
                    <video src={m.media_url} autoPlay loop muted playsInline controls className={`h-auto w-full ${template === "social" && socialMediaWidth === "card" ? "rounded-xl" : ""}`} />
                  ) : (
                    <img src={m.media_url} alt={item.title} className={`h-auto w-full object-cover ${template === "social" && socialMediaWidth === "card" ? "rounded-xl" : ""}`} />
                  )}
                  {template === "social" && (featuredTexts[index] ?? "").trim().length > 0 ? <p className="mt-2 text-sm text-white/80">{featuredTexts[index]}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
          {(hasCustomText || hasLinks) && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              {hasCustomText && (
                <>
                  <h2 className="mb-2 text-lg font-semibold">Tekst</h2>
                  {hasCustomText ? <p className="mb-3 text-sm text-indigo-200">{customText}</p> : null}
                </>
              )}
              {hasLinks && (
                <>
                  <h3 className="mb-2 mt-4 text-lg font-semibold">Linqe</h3>
                  <div className="space-y-2 text-sm">
                    {links.map((link) => (
                      <a key={link} href={link} target="_blank" rel="noreferrer" className="block break-all text-indigo-300 underline">
                        {link}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {presenting ? <PresentModeOverlay media={media} title={item.title} onClose={() => setPresenting(false)} /> : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black shadow-lg">{toast}</div>
      ) : null}
    </main>
  );
}
