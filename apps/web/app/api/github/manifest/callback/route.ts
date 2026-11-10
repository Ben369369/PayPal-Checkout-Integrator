import { NextResponse, type NextRequest } from "next/server";
import { getGithubApp, saveGithubApp } from "@paypal-checkout-integrator/shared";
import { ensureDb, publicUrl } from "@/lib/server";

/**
 * GitHub redirects here after the owner creates the app from our manifest.
 * The one-time code is exchanged for the app's id, private key, and webhook
 * secret, which are stored encrypted; then the owner is sent to install it.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !/^[\w-]+$/.test(code)) return NextResponse.redirect(`${publicUrl()}/setup?error=missing_code`);
  await ensureDb();
  const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!res.ok) return NextResponse.redirect(`${publicUrl()}/setup?error=conversion_failed`);
  const app = (await res.json()) as Parameters<typeof saveGithubApp>[0];
  await saveGithubApp(app);
  const saved = await getGithubApp();
  return NextResponse.redirect(saved?.html_url ? `${saved.html_url}/installations/new` : `${publicUrl()}/setup`);
}
