"use server";

import { cookies, headers } from "next/headers";
import { endSession, requestSignIn, verifyCode, type RequestResult } from "@/lib/auth";
import type { Locale } from "@/lib/data";
import { readSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-cookie";

/** Where the magic link should point: this request's own host, so previews link to themselves. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "astrobakes.xyz";
  return `${proto}://${host}`;
}

export async function requestSignInAction(input: { email: string; locale: Locale; next?: string | null }): Promise<RequestResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return requestSignIn({ ...input, ip, origin: await requestOrigin() });
}

export async function verifyCodeAction(input: { email: string; code: string }): Promise<{ ok: true; next: string } | { ok: false; error: "invalid" | "expired" | "locked" }> {
  const r = await verifyCode(input.email, input.code);
  if (!r.ok) return r;
  (await cookies()).set(SESSION_COOKIE, r.sessionToken, sessionCookieOptions());
  return { ok: true, next: r.next };
}

export async function signOutAction() {
  await endSession(await readSessionToken());
  (await cookies()).delete(SESSION_COOKIE);
}
