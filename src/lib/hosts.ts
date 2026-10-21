/**
 * The admin portal (PRD §4) lives at admin.astrobakes.xyz under /admin. On a
 * production deployment /admin answers only on that host, and that host
 * serves nothing else (next.config.ts redirects the rest to the shop). Vercel
 * previews and local dev have no such host, so /admin works on any host there.
 */
export const ADMIN_HOST = "admin.astrobakes.xyz";

/** Production pins /admin to ADMIN_HOST. VERCEL_ENV is set on Vercel's servers; locally it's unset, which counts as development. */
export const adminHostRequired = () => (process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV) === "production";

export const isAdminPath = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");

/** The host a request was made to: the first x-forwarded-host (Vercel's edge), else Host; lowercased, port dropped. */
export function requestHostname(h: { get(name: string): string | null }): string {
  const raw = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  return raw.replace(/:\d+$/, "");
}

/** May this host serve the admin portal? */
export function adminHostAllowed(hostname: string, required = adminHostRequired()): boolean {
  return !required || hostname === ADMIN_HOST;
}
