import { NextResponse, type NextRequest } from "next/server";

/** HTTP basic auth for the admin pages and admin API (user "admin", password ADMIN_PASSWORD). */
export function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return new NextResponse("ADMIN_PASSWORD is not set", { status: 503 });

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [user, ...rest] = atob(encoded).split(":");
    if (user === "admin" && rest.join(":") === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Store admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
