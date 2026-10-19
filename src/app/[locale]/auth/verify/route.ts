import { NextResponse, type NextRequest } from "next/server";
import { verifyLink } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-cookie";

/** The magic link lands here: verify, open the session, and send the customer back to where they started (PRD 2.1). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const base = isLocale(locale) ? locale : "en";
  const r = await verifyLink(req.nextUrl.searchParams.get("token") ?? "");
  if (!r.ok) return NextResponse.redirect(new URL(`/${base}/sign-in?error=${r.error}`, req.url));
  const res = NextResponse.redirect(new URL(r.next, req.url));
  res.cookies.set(SESSION_COOKIE, r.sessionToken, sessionCookieOptions());
  return res;
}
