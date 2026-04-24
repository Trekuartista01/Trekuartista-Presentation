"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type PresentationItem = {
  id: string;
  title: string;
  description: string;
  published_at: string | null;
  created_at: string;
  is_pinned?: boolean;
  media: { media_url: string; media_type: "image" | "video" }[];
};

export default function Presentation() {
  const [query, setQuery] = useState("");
  const [presentations, setPresentations] = useState<PresentationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      const withPinned = await supabase
        .from("presentations")
        .select("id,title,description,published_at,created_at,is_pinned,media:presentation_media(media_url,media_type)")
        .order("created_at", { ascending: false });

      if (!withPinned.error && withPinned.data) {
        setPresentations(withPinned.data as PresentationItem[]);
        setLoading(false);
        return;
      }

      if (!withPinned.error || !withPinned.error.message.toLowerCase().includes("is_pinned")) {
        setLoading(false);
        return;
      }

      const fallback = await supabase
        .from("presentations")
        .select("id,title,description,published_at,created_at,media:presentation_media(media_url,media_type)")
        .order("created_at", { ascending: false });
      if (!fallback.error && fallback.data) {
        setPresentations((fallback.data as PresentationItem[]).map((x) => ({ ...x, is_pinned: false })));
      }
      setLoading(false);
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const base = presentations.filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    return [...base].sort((a, b) => {
      const pinDiff = Number(!!b.is_pinned) - Number(!!a.is_pinned);
      if (pinDiff !== 0) return pinDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [presentations, query]);

  return (
    <main className="min-h-screen bg-linear-to-b from-black to-[#140b0b] p-3 text-white sm:p-4 lg:p-6">
      <div className="mx-auto w-full">
        <section className="rounded-3xl p-0 lg:p-5 backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="h-14 w-44 overflow-hidden rounded-xl sm:h-16 sm:w-60">
                <img src="/assets/logo-treku.png" alt="Trekuartista" className="h-full w-full object-contain" />
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Kërko..."
                  className="hidden w-[300px] rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40 sm:block"
                />
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen((prev) => !prev)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-sm transition hover:scale-105 hover:bg-white/20 sm:hidden"
                  aria-label="Hap kërkimin"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-white/90">
                    <path
                      d="M15.5 15.5L20 20M17 10.5a6.5 6.5 0 11-13 0a6.5 6.5 0 0113 0z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <Link
                  href="/admin"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-sm transition hover:bg-white/20"
                  aria-label="Shko te admin"
                >
                  👤
                </Link>
              </div>
            </div>
            <p className="text-sm text-white/55">Faqe e dedikuar për prezantime</p>
            <div
              className={`overflow-hidden transition-all duration-300 sm:hidden ${
                mobileSearchOpen ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Kërko..."
                className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40"
              />
            </div>
          </div>

          <div className="mb-4 flex items-center gap-4 text-xs text-white">
            <span>Prezantime: {filtered.length}</span>
          </div>

          <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 8 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="overflow-hidden rounded-2xl border border-white/10 p-3">
                    <div className="h-56 animate-pulse rounded-xl bg-white/10 lg:h-[30vh]" />
                    <div className="space-y-2 px-3 py-3">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                      <div className="mt-3 h-7 w-20 animate-pulse rounded-full bg-white/10" />
                    </div>
                  </div>
                ))
              : null}
            {filtered.map((p) => (
              <Link
                href={`/presentation/${p.id}`}
                key={p.id}
                className="group block overflow-hidden rounded-2xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(120,120,255,0.25)]"
              >
                <div className="relative h-56 overflow-hidden lg:h-[30vh]">
                  {p.is_pinned ? (
                    <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-amber-300/60 bg-black/50 px-2 py-0.5 text-[10px] text-amber-200">🔑 Pinned</span>
                  ) : null}
                  {p.media?.[0]?.media_type === "video" ? (
                    <video src={p.media[0].media_url} className="h-full w-full scale-110 object-cover blur-sm transition duration-500 group-hover:scale-125" muted playsInline />
                  ) : (
                    <img src={p.media?.[0]?.media_url ?? "/assets/logo-treku.png"} alt={p.title} className="h-full w-full scale-110 object-cover blur-[5px] transition duration-500 group-hover:scale-125" />
                  )}
                  <div className="absolute inset-0 bg-black/45 transition duration-300 group-hover:bg-black/25" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
                    <span className="rounded-full border border-white/40 bg-black/45 px-4 py-1 text-xs font-semibold text-white">
                      {p.is_pinned ? "I bllokuar" : "Shiko Prezantimin"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 rounded-b-2xl bg-white/75 p-5 transition duration-300 group-hover:bg-white group-hover:text-white">
                  <p className="text-lg lg:text-xl font-semibold text-black">{p.title}</p>
                  <p className="text-[12px] font-medium text-green-900">
                    Publikuar më {new Date(p.created_at).toLocaleDateString("sq-AL", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <button className="rounded-2xl border cursor-pointer text-black border-black/20 px-4 py-2 text-xs lg:text-sm font-semibold">{p.is_pinned ? "Locked" : "Shiko prezantimin"}</button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
