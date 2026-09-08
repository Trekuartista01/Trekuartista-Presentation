import { NextRequest, NextResponse } from "next/server";
import { fetchAllPresentationsForAdmin } from "@/lib/server/presentations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mirrors the same nickname/password the admin UI already checks client-side (app/admin/page.tsx).
// This is not strong auth — it matches the existing app's security model — but it keeps the
// Supabase service role key itself strictly server-side, which is the part that actually matters.
const ADMIN_NICKNAME = process.env.ADMIN_NICKNAME || "trekuartista";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "18192021";

export async function GET(req: NextRequest) {
  const nickname = req.headers.get("x-admin-nickname");
  const password = req.headers.get("x-admin-password");
  if (nickname !== ADMIN_NICKNAME || password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const items = await fetchAllPresentationsForAdmin();
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown error" }, { status: 500 });
  }
}
