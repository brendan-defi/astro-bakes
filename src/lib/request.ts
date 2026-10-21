import "server-only";
import { headers } from "next/headers";
import { isSameOriginRequest } from "./auth-rules";

/** Where a magic link should point: this request's own origin, so previews and the admin host link to themselves. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "astrobakes.xyz";
  return `${proto}://${host}`;
}

/** The client's IP as Vercel's edge reports it, for per-IP rate limits. */
export async function requestIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Was this request made by our own pages (see isSameOriginRequest)? */
export async function sameOrigin(): Promise<boolean> {
  const h = await headers();
  return isSameOriginRequest({ secFetchSite: h.get("sec-fetch-site"), origin: h.get("origin"), host: h.get("host"), forwardedHost: h.get("x-forwarded-host") });
}
