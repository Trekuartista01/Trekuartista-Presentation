import { NextRequest, NextResponse } from "next/server";
import { getPresentationForViewer } from "@/lib/server/presentations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readPassword(req: NextRequest): Promise<string | undefined> {
  try {
    const body = await req.json();
    return typeof body?.password === "string" ? body.password : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const password = await readPassword(req);
  const result = await getPresentationForViewer(id, password);

  if (result.status === "not_found") {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }
  if (result.status === "locked") {
    return NextResponse.json({ status: "locked" }, { status: 401 });
  }
  return NextResponse.json({ status: "ok", presentation: result.data });
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  // Convenience for a first, password-less load (e.g. straight link visits / metadata warm-up).
  const { id } = await context.params;
  const result = await getPresentationForViewer(id, undefined);
  if (result.status === "not_found") {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }
  if (result.status === "locked") {
    return NextResponse.json({ status: "locked" }, { status: 401 });
  }
  return NextResponse.json({ status: "ok", presentation: result.data });
}
