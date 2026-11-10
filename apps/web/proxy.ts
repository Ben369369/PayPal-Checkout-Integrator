import { NextResponse, type NextRequest } from "next/server";

/**
 * The dashboard (repo settings, plan approval, setup) sits behind HTTP basic
 * auth. Public: GitHub and PayPal webhooks, health, run reports (linked from
 * PRs), and their artifacts.
 */
const PUBLIC = [/^\/api\/github\/webhook$/, /^\/api\/paypal\/relay\//, /^\/api\/health$/, /^\/api\/artifacts\//, /^\/runs\/[^/]+\/report$/, /^\/icon\.svg$/];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return new NextResponse("DASHBOARD_PASSWORD is not set", { status: 503 });
  const [scheme, encoded] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    const [user, ...rest] = atob(encoded).split(":");
    if (user === "admin" && rest.join(":") === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="PayPal Checkout Integrator"' } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
