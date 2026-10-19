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

export async function readSessionToken(): Promise<string | null> {
  const v = (await cookies()).get(SESSION_COOKIE)?.value;
  return v && TOKEN_SHAPE.test(v) ? v : null;
}

export async function readFlowSecret(): Promise<string | null> {
  const v = (await cookies()).get(AUTH_FLOW_COOKIE)?.value;
  return v && TOKEN_SHAPE.test(v) ? v : null;
}
