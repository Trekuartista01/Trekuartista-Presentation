// SERVER-ONLY module. Never import this file from a "use client" component —
// it uses the Supabase service role key, which must never reach the browser bundle.
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password, "utf8").digest("hex");
}

export type ServerMediaRow = {
  id?: string;
  media_url: string;
  media_type: "image" | "video";
  sort_order: number;
  media_size_bytes?: number | null;
};

type PresentationRow = {
  id: string;
  title: string;
  description: string;
  published_at: string | null;
  is_pinned: boolean | null;
  access_password_hash: string | null;
  media: ServerMediaRow[];
};

async function fetchPresentationRow(id: string): Promise<PresentationRow | null> {
  const supabaseAdmin = getAdminClient();
  const { data, error } = await supabaseAdmin
    .from("presentations")
    .select(
      "id,title,description,published_at,is_pinned,access_password_hash,media:presentation_media(id,media_url,media_type,sort_order,media_size_bytes)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as PresentationRow;
}

export type ViewerResult =
  | { status: "not_found" }
  | { status: "locked" }
  | {
      status: "ok";
      data: {
        id: string;
        title: string;
        description: string;
        is_pinned: boolean;
        media: { media_url: string; media_type: "image" | "video"; sort_order: number }[];
      };
    };

export async function getPresentationForViewer(id: string, password?: string): Promise<ViewerResult> {
  const row = await fetchPresentationRow(id);
  if (!row) return { status: "not_found" };

  const hasPassword = !!row.access_password_hash;
  if (hasPassword) {
    const ok = typeof password === "string" && password.length > 0 && hashPassword(password) === row.access_password_hash;
    if (!ok) return { status: "locked" };
  }

  return {
    status: "ok",
    data: {
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      is_pinned: !!row.is_pinned,
      media: [...(row.media ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((m) => ({ media_url: m.media_url, media_type: m.media_type, sort_order: m.sort_order })),
    },
  };
}

export type SeoMeta = { title: string; description: string; image: string | null };

export async function getPresentationMetaForSeo(id: string): Promise<SeoMeta | null> {
  const row = await fetchPresentationRow(id);
  if (!row) return null;

  if (row.access_password_hash) {
    return {
      title: "Prezantim i mbrojtur",
      description: "Ky prezantim kërkon fjalëkalim për t'u parë.",
      image: null,
    };
  }

  const firstImage = (row.media ?? []).find((m) => m.media_type === "image");
  return {
    title: row.title,
    description: row.description?.trim() || "Prezantim nga Trekuartista.",
    image: firstImage?.media_url ?? null,
  };
}

export async function fetchAllPresentationsForAdmin() {
  const supabaseAdmin = getAdminClient();
  const { data, error } = await supabaseAdmin
    .from("presentations")
    .select(
      "id,title,description,published_at,is_pinned,access_password_hash,media:presentation_media(id,media_url,media_type,sort_order,media_size_bytes)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
