"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PresentationData = {
  id: string;
  title: string;
  description: string;
  is_pinned?: boolean;
  media: { media_url: string; media_type: "image" | "video"; sort_order: number }[];
};

export default function PresentationSinglePage({ params }: { params: Promise<{ id: string }> }) {
  const [item, setItem] = useState<PresentationData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [template, setTemplate] = useState<"classic" | "social">("classic");
  const [layoutCols, setLayoutCols] = useState<1 | 3>(1);
  const [socialMediaWidth, setSocialMediaWidth] = useState<"card" | "full">("card");
  const [featuredFullWidth, setFeaturedFullWidth] = useState(false);
  const [featuredPosition, setFeaturedPosition] = useState<"top" | "bottom">("top");
  const [featuredCount, setFeaturedCount] = useState(0);
  const [customText, setCustomText] = useState("");
  const [mediaTexts, setMediaTexts] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { id } = await params;
      const withPinned = await supabase
        .from("presentations")
        .select("id,title,description,is_pinned,media:presentation_media(media_url,media_type,sort_order)")
        .eq("id", id)
        .single();
      let data = withPinned.data as PresentationData | null;
      let error = withPinned.error;
      if (error && error.message.toLowerCase().includes("is_pinned")) {
        const fallback = await supabase
          .from("presentations")
          .select("id,title,description,media:presentation_media(media_url,media_type,sort_order)")
          .eq("id", id)
          .single();
        data = (fallback.data as PresentationData | null) ?? null;
        error = fallback.error;
      }

      if (!error && data) {
        const row = data;
        setIsPinned(!!row.is_pinned);
        setItem({
          ...row,
          media: [...(row.media ?? [])].sort((a, b) => a.sort_order - b.sort_order),
        });
        const savedDesigns = localStorage.getItem("treku_presentation_designs");
        if (savedDesigns) {
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
          const picked = designsMap[id];
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
        }
      }
      setLoaded(true);
    };
    void load();
  }, [params]);

  if (!loaded) return <main className="min-h-screen bg-linear-to-b from-black via-[#050b14] to-[#000000] p-6 text-white">Loading...</main>;
  if (!item) return <main className="min-h-screen bg-linear-to-b from-black via-[#050b14] to-[#000000] p-6 text-white">Prezantimi nuk u gjet.</main>;
  if (isPinned) {
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
  const mediaGridClass = layoutCols === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3";
  const media = item.media ?? [];
  const activeFeaturedCount =
    template === "social" && layoutCols === 3 && featuredFullWidth ? Math.min(Math.max(featuredCount, 0), media.length) : 0;
  const featuredMedia = media.slice(0, activeFeaturedCount);
  const gridMedia = media.slice(activeFeaturedCount);
  const featuredTexts = mediaTexts.slice(0, activeFeaturedCount);
  const gridTexts = mediaTexts.slice(activeFeaturedCount);

  return (
    <main className="min-h-screen bg-linear-to-b from-black via-[#050b14] to-[#000000] p-6 lg:p-16 text-white">
      <div className="mx-auto grid h-auto w-full grid-cols-1 gap-6">
        <div className="rounded-3xl bg-white/5 p-5 lg:p-10 backdrop-blur-xl">
          <div className="mb-5">
            <h1 className="text-3xl lg:text-5xl font-bold">{item.title}</h1>
            {isPinned ? <p className="mt-2 inline-flex rounded-full border border-amber-300/60 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">🔑 Pinned</p> : null}
          </div>
          {featuredPosition === "top" && featuredMedia.length > 0 ? (
            <div className="mb-4 space-y-4">
              {featuredMedia.map((m, index) => (
                <div key={`${m.media_url}-${index}`} className={template === "social" && socialMediaWidth === "card" ? "rounded-2xl border border-white/10 bg-[#0d1522] p-3" : ""}>
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
                <div key={`${m.media_url}-${index}`} className={template === "social" && socialMediaWidth === "card" ? "rounded-2xl border border-white/10 bg-[#0d1522] p-3" : ""}>
                  <video src={m.media_url} autoPlay loop muted playsInline controls className={`h-auto w-full ${template === "social" && socialMediaWidth === "card" ? "rounded-xl" : ""}`} />
                  {template === "social" && (gridTexts[index] ?? "").trim().length > 0 ? <p className="mt-2 text-sm text-white/80">{gridTexts[index]}</p> : null}
                </div>
              ) : (
                <div key={`${m.media_url}-${index}`} className={template === "social" && socialMediaWidth === "card" ? "rounded-2xl border border-white/10 bg-[#0d1522] p-3" : ""}>
                  <img src={m.media_url} alt={item.title} className={`h-auto w-full object-cover ${template === "social" && socialMediaWidth === "card" ? "rounded-xl" : ""}`} />
                  {template === "social" && (gridTexts[index] ?? "").trim().length > 0 ? <p className="mt-2 text-sm text-white/80">{gridTexts[index]}</p> : null}
                </div>
              ),
            )}
          </div>
          {featuredPosition === "bottom" && featuredMedia.length > 0 ? (
            <div className="mt-4 space-y-4">
              {featuredMedia.map((m, index) => (
                <div key={`${m.media_url}-${index}`} className={template === "social" && socialMediaWidth === "card" ? "rounded-2xl border border-white/10 bg-[#0d1522] p-3" : ""}>
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
    </main>
  );
}
