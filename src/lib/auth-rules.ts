import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Pure pieces of magic-link + code sign-in (D13, PRD 2.1, 5.4), kept free of
 * database and framework imports so they can be unit tested.
 */

export const TOKEN_MINUTES = 15;
export const SESSION_DAYS = 90;
export const CODE_LENGTH = 6;
/** Wrong-code attempts before a token is dead and a new email is needed. */
export const MAX_CODE_ATTEMPTS = 5;
/** Sign-in emails allowed per address and per IP in the window (PRD 5.4). */
export const RATE_WINDOW_MINUTES = 10;
export const RATE_PER_EMAIL = 3;
export const RATE_PER_IP = 10;

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(input: string): string {
  return (input ?? "").trim().toLowerCase();
}

/** 32 random bytes, URL-safe; goes in the magic link and is never stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Six digits with leading zeros, from a CSPRNG. */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export const hashToken = (token: string) => sha256(`token:${token}`);
export const hashSession = (token: string) => sha256(`session:${token}`);
/** The code is salted with the token's row id so equal codes never share a hash. */
export const hashCode = (tokenId: string, code: string) => sha256(`code:${tokenId}:${code}`);
export const hashIp = (ip: string | null | undefined) => (ip ? sha256(`ip:${ip.trim()}`) : null);

export function codeMatches(tokenId: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(tokenId, code.replace(/\D/g, "")));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only same-site paths may be used as a return target; anything else falls back. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}
