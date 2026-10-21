"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { assertAdminHost } from "@/lib/admin";
import { endSession, requestSignIn, verifyCode, type RequestResult } from "@/lib/auth";
import { generateToken } from "@/lib/auth-rules";
import { requestIp, requestOrigin } from "@/lib/request";
import {
  ADMIN_FLOW_COOKIE,
  ADMIN_SESSION_COOKIE,
  adminCookieCleared,
  adminFlowCookieOptions,
  adminSessionCookieOptions,
  readAdminFlowSecret,
  readAdminSessionToken,
} from "@/lib/session-cookie";

/**
 * The admin sign-in (PRD 5.4): the shop's magic link + code with audience
 * "admin". These are the only admin actions that run signed out, so each
 * checks the host itself; everything else in the portal calls requireAdmin.
 */

export async function requestAdminSignInAction(input: { email: string; next?: string | null }): Promise<RequestResult> {
  await assertAdminHost();
  const jar = await cookies();
  const flowSecret = (await readAdminFlowSecret()) ?? generateToken();
  jar.set(ADMIN_FLOW_COOKIE, flowSecret, adminFlowCookieOptions());
  return requestSignIn({ email: input.email, next: input.next, locale: "en", audience: "admin", ip: await requestIp(), origin: await requestOrigin(), flowSecret });
}

export async function verifyAdminCodeAction(input: { email: string; code: string }): Promise<{ ok: true; next: string } | { ok: false; error: "invalid" | "expired" | "locked" }> {
  await assertAdminHost();
  const r = await verifyCode(input.email, input.code, await readAdminFlowSecret(), "admin");
  if (!r.ok) return { ok: false, error: r.error === "confirm" ? "expired" : r.error };
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, r.sessionToken, adminSessionCookieOptions());
  jar.set(ADMIN_FLOW_COOKIE, "", adminCookieCleared());
  return { ok: true, next: r.next };
}

export async function signOutAdminAction(): Promise<void> {
  await assertAdminHost();
  await endSession(await readAdminSessionToken());
  (await cookies()).set(ADMIN_SESSION_COOKIE, "", adminCookieCleared());
  redirect("/admin/sign-in");
}
