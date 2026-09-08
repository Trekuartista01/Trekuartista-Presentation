import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import PresentationView from "./PresentationView";

type SeoMedia = { media_url: string; media_type: "image" | "video"; sort_order: number };

async function getPresentationMeta(id: string): Promise<{ title: string; description: string; image: string | null } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase
    .from("presentations")
    .select("title,description,media:presentation_media(media_url,media_type,sort_order)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const media = (data.media ?? []) as SeoMedia[];
  const firstImage = [...media].sort((a, b) => a.sort_order - b.sort_order).find((m) => m.media_type === "image");

  return {
    title: (data.title as string) || "Prezantimi",
    description: ((data.description as string) || "").trim() || "Prezantim nga Trekuartista.",
    image: firstImage?.media_url ?? null,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await getPresentationMeta(id);
  if (!meta) {
    return { title: "Prezantimi nuk u gjet" };
  }
  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
      images: meta.image ? [{ url: meta.image }] : undefined,
    },
    twitter: {
      card: meta.image ? "summary_large_image" : "summary",
      title: meta.title,
      description: meta.description,
      images: meta.image ? [meta.image] : undefined,
    },
  };
}

export default async function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PresentationView id={id} />;
}
