import { NextResponse, type NextRequest } from "next/server";
import { getRun, listEvents } from "@paypal-checkout-integrator/shared";
import { ensureDb } from "@/lib/server";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/runs/[id]/events">) {
  const { id } = await ctx.params;
  await ensureDb();
  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const after = Number(request.nextUrl.searchParams.get("after") ?? 0);
  const events = await listEvents(id, Number.isFinite(after) ? after : 0);
  return NextResponse.json(
    { status: run.status, stage: run.stage, events: events.map((e) => ({ id: Number(e.id), at: e.at, message: e.message })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
