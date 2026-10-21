import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { CODE_LENGTH } from "./sign-in-code";

/**
 * Pure pieces of magic-link + code sign-in (D13, PRD 2.1, 5.4), kept free of
 * database and framework imports so they can be unit tested.
 */

export const TOKEN_MINUTES = 15;
export const SESSION_DAYS = 90;
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

/** 32 random bytes, URL-safe; used for link tokens, session tokens and the browser flow secret. Never stored raw. */
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
export const hashFlow = (secret: string) => sha256(`flow:${secret}`);
/** The code is salted with the token's row id so equal codes never share a hash. */
export const hashCode = (tokenId: string, code: string) => sha256(`code:${tokenId}:${code}`);
export const hashIp = (ip: string | null | undefined) => (ip ? sha256(`ip:${ip.trim()}`) : null);

function equalHashes(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function codeMatches(tokenId: string, code: string, storedHash: string): boolean {
  return equalHashes(hashCode(tokenId, code.replace(/\D/g, "")), storedHash);
}

/** Does this browser's flow secret match the one the token was requested with? */
export function flowMatches(secret: string | null | undefined, storedHash: string): boolean {
  return !!secret && equalHashes(hashFlow(secret), storedHash);
}

const DUMMY = "https://same.invalid";
/** A path we would hand to a redirect: starts with one slash, no scheme/host, no backslash, no control characters. */
const unsafePath = (s: string) => !s.startsWith("/") || s.startsWith("//") || /[\\\u0000-\u001F\u007F]/.test(s);

/**
 * Only a same-site path may be used as a return target. The input is checked,
 * then normalised (dot segments, percent-encoding) by the URL parser, and the
 * normalised string we actually return is checked again: "/safe/..//host"
 * normalises to "//host", which a browser would treat as protocol-relative.
 */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || unsafePath(next)) return fallback;
  try {
    const u = new URL(next, DUMMY);
    if (u.origin !== DUMMY) return fallback;
    const out = u.pathname + u.search + u.hash;
    if (unsafePath(out) || new URL(out, DUMMY).origin !== DUMMY) return fallback;
    return out;
  } catch {
    return fallback;
  }
}

/** An admin sign-in's return target: a same-site path inside the admin portal, or its dashboard. */
export function adminNext(next: string | null | undefined): string {
  const out = safeNext(next, "/admin");
  return /^\/admin(?:[/?#]|$)/.test(out) ? out : "/admin";
}

/** Where the sign-in page sends an already-signed-in visitor (or lands them after the code): the requested path, or their account. */
export function signInDestination(nextParam: string | null | undefined, locale: string): string {
  return safeNext(nextParam, `/${locale}/account`);
}

/** "jane.doe@example.com" → "j***@example.com", for the confirmation page. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.charAt(0)}***@${domain}`;
}

/**
 * Was this request made by our own pages? Modern browsers send Sec-Fetch-Site;
 * older ones send Origin on POST. A confirmation that switches accounts must
 * never be triggered cross-site (login CSRF).
 */
export function isSameOriginRequest(h: { secFetchSite?: string | null; origin?: string | null; host?: string | null; forwardedHost?: string | null }): boolean {
  const site = h.secFetchSite?.toLowerCase();
  if (site) return site === "same-origin" || site === "none";
  if (!h.origin) return false;
  const host = (h.forwardedHost ?? h.host ?? "").split(",")[0].trim().toLowerCase();
  try {
    return !!host && new URL(h.origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
