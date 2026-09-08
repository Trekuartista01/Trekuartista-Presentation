import type { Metadata } from "next";
import { getPresentationMetaForSeo } from "@/lib/server/presentations";
import PresentationView from "./PresentationView";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await getPresentationMetaForSeo(id);
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
