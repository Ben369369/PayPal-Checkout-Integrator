import { NextResponse, type NextRequest } from "next/server";
import { getInstallation, getRun, listEvents } from "@paypal-checkout-integrator/shared";
import { canAccess, currentUser } from "@/lib/auth";
import { ensureDb } from "@/lib/server";

/** Live log for a run; only the store's owner can read it. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/runs/[id]/events">) {
  const { id } = await ctx.params;
  await ensureDb();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const run = await getRun(id);
  const inst = run ? await getInstallation(run.installation_id) : null;
  if (!run || !inst || !canAccess(user, inst)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const after = Number(request.nextUrl.searchParams.get("after") ?? 0);
  const events = await listEvents(id, Number.isFinite(after) ? after : 0);
  return NextResponse.json(
    { status: run.status, stage: run.stage, events: events.map((e) => ({ id: Number(e.id), at: e.at, message: e.message })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
