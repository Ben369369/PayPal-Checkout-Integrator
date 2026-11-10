import { NextResponse, type NextRequest } from "next/server";
import { deleteSession } from "@paypal-checkout-integrator/shared";
import { SESSION_COOKIE } from "@/lib/auth";
import { ensureDb, publicUrl } from "@/lib/server";

export async function POST(request: NextRequest) {
  await ensureDb();
  const id = request.cookies.get(SESSION_COOKIE)?.value;
  if (id) await deleteSession(id);
  const res = NextResponse.redirect(`${publicUrl()}/`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
