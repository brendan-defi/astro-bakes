import { NextResponse, type NextRequest } from "next/server";
import { redeemLink } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";
import { AUTH_FLOW_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-cookie";

/**
 * The magic link lands here. The browser that asked for it (flow cookie) is
 * signed in and sent back to where it started; any other browser, including
 * email link scanners, is sent to the confirmation page without the link being
 * spent (PRD 2.1; login-CSRF protection).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const base = isLocale(locale) ? locale : "en";
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const r = await redeemLink(token, { flowSecret: req.cookies.get(AUTH_FLOW_COOKIE)?.value });
  if (!r.ok) {
    if (r.error === "confirm") return NextResponse.redirect(new URL(`/${r.locale}/auth/confirm?token=${encodeURIComponent(token)}`, req.url));
    return NextResponse.redirect(new URL(`/${base}/sign-in?error=${r.error}`, req.url));
  }
  // The stored path is already same-site; resolving it must still land on this host.
  const target = new URL(r.next, req.url);
  const dest = target.origin === req.nextUrl.origin ? target : new URL(`/${r.locale}`, req.url);
  const res = NextResponse.redirect(dest);
  res.cookies.set(SESSION_COOKIE, r.sessionToken, sessionCookieOptions());
  res.cookies.delete(AUTH_FLOW_COOKIE);
  return res;
}
