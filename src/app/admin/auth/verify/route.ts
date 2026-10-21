import { NextResponse, type NextRequest } from "next/server";
import { redeemLink } from "@/lib/auth";
import { adminHostAllowed, requestHostname } from "@/lib/hosts";
import { ADMIN_FLOW_COOKIE, ADMIN_SESSION_COOKIE, adminCookieCleared, adminSessionCookieOptions } from "@/lib/session-cookie";

/**
 * The admin magic link lands here. Only the browser that asked for it (admin
 * flow cookie) is signed in; any other browser, or an email link scanner, is
 * told to type the code instead, and the link isn't spent. There's no
 * confirmation page as on the shop: it's one person on one laptop (PRD 5.4).
 */
export async function GET(req: NextRequest) {
  if (!adminHostAllowed(requestHostname(req.headers))) return new NextResponse("Not found", { status: 404 });
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const r = await redeemLink(token, { flowSecret: req.cookies.get(ADMIN_FLOW_COOKIE)?.value, audience: "admin" });
  if (!r.ok) {
    const error = r.error === "confirm" ? "other_browser" : r.error;
    return NextResponse.redirect(new URL(`/admin/sign-in?error=${error}`, req.url));
  }
  // The stored path is already inside /admin; resolving it must still land on this host.
  const target = new URL(r.next, req.url);
  const res = NextResponse.redirect(target.origin === req.nextUrl.origin ? target : new URL("/admin", req.url));
  res.cookies.set(ADMIN_SESSION_COOKIE, r.sessionToken, adminSessionCookieOptions());
  res.cookies.set(ADMIN_FLOW_COOKIE, "", adminCookieCleared());
  return res;
}
