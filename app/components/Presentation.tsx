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

  useEffect(() => {
    const load = async () => {
      const withPinned = await supabase
        .from("presentations")
        .select("id,title,description,published_at,created_at,is_pinned,media:presentation_media(media_url,media_type)")
        .order("created_at", { ascending: false });

      if (!withPinned.error && withPinned.data) {
        setPresentations(withPinned.data as PresentationItem[]);
        return;
      }

      const fallback = await supabase
        .from("presentations")
        .select("id,title,description,published_at,created_at,media:presentation_media(media_url,media_type)")
        .order("created_at", { ascending: false });
      if (!fallback.error && fallback.data) {
        setPresentations((fallback.data as PresentationItem[]).map((x) => ({ ...x, is_pinned: false })));
      }
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const base = presentations.filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    return [...base].sort((a, b) => Number(!!b.is_pinned) - Number(!!a.is_pinned));
  }, [presentations, query]);

  const imageCount = filtered.reduce((acc, p) => acc + p.media.filter((m) => m.media_type === "image").length, 0);
  const videoCount = filtered.reduce((acc, p) => acc + p.media.filter((m) => m.media_type === "video").length, 0);

  return (
    <main className="min-h-screen bg-linear-to-b from-black to-[#140b0b] p-6 text-white">
      <div className="mx-auto w-full">
        <section className="rounded-3xl p-0 lg:p-5 backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-3 h-16 w-60 overflow-hidden rounded-xl">
                <img src="/assets/logo-treku.png" alt="Trekuartista" className="h-full w-full object-contain" />
              </div>
              {/* <h1 className="text-3xl font-bold">Trekuartista</h1> */}
              <p className="text-sm text-white/55">Faqe e dedikuar për prezantime</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Kërko..."
                className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40 sm:w-[300px]"
              />
              <Link href="/admin" className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold">
                Admin
              </Link>
            </div>
          </div>

          <div className="mb-4 flex items-center gap-4 text-xs text-white">
            <span>Prezantime: {filtered.length}</span>
            <span>Media: {imageCount + videoCount}</span>
            <span>Imazhe: {imageCount}</span>
            <span>Video: {videoCount}</span>
          </div>

          <div className="mt-16 grid gap-4 lg:grid-cols-4">
            {filtered.map((p) => (
              <Link
                href={`/presentation/${p.id}`}
                key={p.id}
                className="group block overflow-hidden rounded-2xl border-[0.5px] border-white/50 p-3 transition duration-300 hover:-translate-y-1 hover:border-white/80 hover:shadow-[0_10px_25px_rgba(120,120,255,0.25)]"
              >
                <div className="relative h-44 overflow-hidden lg:h-[30vh]">
                  {p.is_pinned ? (
                    <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-amber-300/60 bg-black/50 px-2 py-0.5 text-[10px] text-amber-200">🔑 Pinned</span>
                  ) : null}
                  {p.media?.[0]?.media_type === "video" ? (
                    <video src={p.media[0].media_url} className="h-full w-full scale-110 object-cover blur-sm transition duration-500 group-hover:scale-125" muted playsInline />
                  ) : (
                    <img src={p.media?.[0]?.media_url ?? "/assets/logo-treku.png"} alt={p.title} className="h-full w-full scale-110 object-cover blur-sm transition duration-500 group-hover:scale-125" />
                  )}
                  <div className="absolute inset-0 bg-black/45 transition duration-300 group-hover:bg-black/25" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
                    <span className="rounded-full border border-white/40 bg-black/45 px-4 py-1 text-xs font-semibold text-white">
                      {p.is_pinned ? "I bllokuar" : "Shiko Prezantimin"}
                    </span>
                  </div>
                 
                  <span className="absolute bottom-2 right-2 rounded-full border border-white/25 bg-black/40 px-2 py-0.5 text-[10px] text-white/80">
                    {p.media?.length ?? 0} file
                  </span>
                </div>
                <div className="space-y-1 px-3 py-2 transition duration-300 group-hover:text-white">
                  <p className="text-lg font-semibold">{p.title}</p>
                  <p className="text-[11px] text-emerald-400">
                    Krijuar më {new Date(p.created_at).toLocaleDateString("sq-AL", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <button className="rounded-full border border-white/20 px-4 py-1 text-xs font-semibold">{p.is_pinned ? "Locked" : "Shiko"}</button>
                    <span className="text-[10px] text-white/60">{p.media?.length ?? 0} media</span>
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
