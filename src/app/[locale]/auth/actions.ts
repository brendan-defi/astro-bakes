"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { endSession, redeemLink, requestSignIn, verifyCode, type RequestResult } from "@/lib/auth";
import { generateToken, isSameOriginRequest } from "@/lib/auth-rules";
import type { Locale } from "@/lib/data";
import { AUTH_FLOW_COOKIE, flowCookieOptions, readFlowSecret, readSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-cookie";

/** Where the magic link should point: this request's own host, so previews link to themselves. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "astrobakes.xyz";
  return `${proto}://${host}`;
}

async function sameOrigin(): Promise<boolean> {
  const h = await headers();
  return isSameOriginRequest({ secFetchSite: h.get("sec-fetch-site"), origin: h.get("origin"), host: h.get("host"), forwardedHost: h.get("x-forwarded-host") });
}

export async function requestSignInAction(input: { email: string; locale: Locale; next?: string | null }): Promise<RequestResult> {
  const h = await headers();
  const jar = await cookies();
  // The browser's flow secret: reused across resends in this browser, refreshed to the token lifetime.
  const flowSecret = (await readFlowSecret()) ?? generateToken();
  jar.set(AUTH_FLOW_COOKIE, flowSecret, flowCookieOptions());
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return requestSignIn({ ...input, ip, origin: await requestOrigin(), flowSecret });
}

export async function verifyCodeAction(input: { email: string; code: string }): Promise<{ ok: true; next: string } | { ok: false; error: "invalid" | "expired" | "locked" }> {
  const r = await verifyCode(input.email, input.code, await readFlowSecret());
  if (!r.ok) return { ok: false, error: r.error === "confirm" ? "expired" : r.error };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, r.sessionToken, sessionCookieOptions());
  jar.delete(AUTH_FLOW_COOKIE);
  return { ok: true, next: r.next };
}

/**
 * The confirmation page's button. A browser that didn't request the link can only
 * sign in with it through this same-origin POST, so a link someone else requested
 * can never switch this browser's account without a deliberate click.
 */
export async function confirmLinkAction(locale: Locale, token: string): Promise<void> {
  if (!(await sameOrigin())) redirect(`/${locale}/sign-in?error=invalid`);
  const r = await redeemLink(token, { confirmed: true });
  if (!r.ok) redirect(`/${locale}/sign-in?error=${r.error === "confirm" ? "invalid" : r.error}`);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, r.sessionToken, sessionCookieOptions());
  jar.delete(AUTH_FLOW_COOKIE);
  redirect(r.next);
}

export async function signOutAction() {
  await endSession(await readSessionToken());
  (await cookies()).delete(SESSION_COOKIE);
}
