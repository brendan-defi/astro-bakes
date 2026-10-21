import "server-only";
import { cookies } from "next/headers";
import { SESSION_DAYS, TOKEN_MINUTES } from "./auth-rules";

/** The browser's session token (hashed in `sessions`); 90 days, explicit sign-out (PRD 2.1). */
export const SESSION_COOKIE = "ab-session";
/** The browser's sign-in flow secret (hashed on the token it requested); lets that browser, and only that browser, redeem silently. */
export const AUTH_FLOW_COOKIE = "ab-auth";

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/;
const base = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" };

export function sessionCookieOptions() {
  return { ...base, maxAge: SESSION_DAYS * 24 * 60 * 60 };
}

export function flowCookieOptions() {
  return { ...base, maxAge: TOKEN_MINUTES * 60 };
}

/**
 * The admin portal's own session and flow cookies (PRD 5.4): host-only on the
 * admin host and scoped to /admin, so the shop never sees them and an admin
 * sign-in never touches the customer session in the same browser.
 */
export const ADMIN_SESSION_COOKIE = "ab-admin";
export const ADMIN_FLOW_COOKIE = "ab-admin-auth";
const admin = { ...base, path: "/admin" };

export function adminSessionCookieOptions() {
  return { ...admin, maxAge: SESSION_DAYS * 24 * 60 * 60 };
}

export function adminFlowCookieOptions() {
  return { ...admin, maxAge: TOKEN_MINUTES * 60 };
}

/** Clears an admin cookie (same path, so the browser drops the right one). */
export function adminCookieCleared() {
  return { ...admin, maxAge: 0 };
}

export async function readAdminSessionToken(): Promise<string | null> {
  const v = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  return v && TOKEN_SHAPE.test(v) ? v : null;
}

export async function readAdminFlowSecret(): Promise<string | null> {
  const v = (await cookies()).get(ADMIN_FLOW_COOKIE)?.value;
  return v && TOKEN_SHAPE.test(v) ? v : null;
}

export async function readSessionToken(): Promise<string | null> {
  const v = (await cookies()).get(SESSION_COOKIE)?.value;
  return v && TOKEN_SHAPE.test(v) ? v : null;
}

export async function readFlowSecret(): Promise<string | null> {
  const v = (await cookies()).get(AUTH_FLOW_COOKIE)?.value;
  return v && TOKEN_SHAPE.test(v) ? v : null;
}
