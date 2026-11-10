import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { githubOAuthClient } from "@paypal-checkout-integrator/shared";
import { ensureDb, publicUrl } from "@/lib/server";

/** Starts "Sign in with GitHub" (the GitHub App's user authorization). */
export async function GET(request: NextRequest) {
  await ensureDb();
  const oauth = await githubOAuthClient();
  if (!oauth) return NextResponse.redirect(`${publicUrl()}/?error=signin_unavailable`);
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", oauth.clientId);
  url.searchParams.set("redirect_uri", `${publicUrl()}/api/auth/callback`);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  const secure = publicUrl().startsWith("https://");
  res.cookies.set("pci_oauth_state", state, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });
  res.cookies.set("pci_next", next.startsWith("/") && !next.startsWith("//") ? next : "/", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });
  return res;
}
