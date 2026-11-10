import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSession, githubOAuthClient } from "@paypal-checkout-integrator/shared";
import { fetchUserInstallationIds, SESSION_COOKIE } from "@/lib/auth";
import { ensureDb, publicUrl } from "@/lib/server";

/** GitHub sends the user back here after they approve "Sign in with GitHub". */
export async function GET(request: NextRequest) {
  await ensureDb();
  const base = publicUrl();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get("pci_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) return NextResponse.redirect(`${base}/?error=signin_failed`);

  const oauth = await githubOAuthClient();
  if (!oauth) return NextResponse.redirect(`${base}/?error=signin_unavailable`);
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: oauth.clientId, client_secret: oauth.clientSecret, code, redirect_uri: `${base}/api/auth/callback` }),
  });
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) return NextResponse.redirect(`${base}/?error=signin_failed`);

  const userRes = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  if (!userRes.ok) return NextResponse.redirect(`${base}/?error=signin_failed`);
  const user = (await userRes.json()) as { id: number; login: string; name: string | null; avatar_url: string | null };
  const installationIds = (await fetchUserInstallationIds(token)) ?? [];

  const id = randomBytes(32).toString("hex");
  await createSession({ id, githubUserId: user.id, login: user.login, name: user.name, avatarUrl: user.avatar_url, token, installationIds, days: 7 });

  const next = request.cookies.get("pci_next")?.value ?? "/";
  const res = NextResponse.redirect(`${base}${next.startsWith("/") && !next.startsWith("//") ? next : "/"}`);
  res.cookies.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https://"), path: "/", maxAge: 7 * 24 * 3600 });
  res.cookies.delete("pci_oauth_state");
  res.cookies.delete("pci_next");
  return res;
}
