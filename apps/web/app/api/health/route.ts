import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/server";

export async function GET() {
  try {
    await ensureDb();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
