import { NextResponse, type NextRequest } from "next/server";
import { getArtifact } from "@paypal-checkout-integrator/shared";
import { ensureDb } from "@/lib/server";

/** Serves run videos and Playwright traces. CORS is open so trace.playwright.dev can load traces. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/artifacts/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  await ensureDb();
  const artifact = await getArtifact(id);
  if (!artifact) return new NextResponse("Not found", { status: 404 });
  const bytes = new Uint8Array(artifact.bytes);
  const headers: Record<string, string> = {
    "Content-Type": artifact.content_type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `inline; filename="${artifact.name.replace(/[^\w.-]/g, "_")}"`,
  };
  // Range support so browsers can seek in the videos.
  const range = request.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    return new NextResponse(bytes.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${bytes.length}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(bytes, { headers: { ...headers, "Content-Length": String(bytes.length) } });
}
