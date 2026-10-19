import "server-only";
import { cookies } from "next/headers";
import { SESSION_DAYS } from "./auth-rules";

/** The browser's session token (hashed in `sessions`); 90 days, explicit sign-out (PRD 2.1). */
export const SESSION_COOKIE = "ab-session";

export function sessionCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production", maxAge: SESSION_DAYS * 24 * 60 * 60 };
}

export async function readSessionToken(): Promise<string | null> {
  const v = (await cookies()).get(SESSION_COOKIE)?.value;
  return v && /^[A-Za-z0-9_-]{32,64}$/.test(v) ? v : null;
}
