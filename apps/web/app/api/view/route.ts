import { NextResponse, type NextRequest } from "next/server";
import { VIEW_COOKIE } from "@/lib/view";
import { publicUrl } from "@/lib/server";

/** Switches between the Simple and Developer views, then returns to the page. */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") === "developer" ? "developer" : "simple";
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const res = NextResponse.redirect(`${publicUrl()}${next.startsWith("/") && !next.startsWith("//") ? next : "/"}`);
  res.cookies.set(VIEW_COOKIE, mode, { sameSite: "lax", path: "/", maxAge: 365 * 24 * 3600 });
  return res;
}
