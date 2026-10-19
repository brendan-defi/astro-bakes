/**
 * Neon hands us connection strings with `sslmode=require`. node-postgres is
 * changing what that means (towards libpq's "encrypt but don't verify") and
 * warns on every connection until the mode is explicit. We want the server
 * certificate verified, so ask for `verify-full` outright.
 */
export function withVerifyFull(url: string): string {
  const u = new URL(url);
  // A URL with no sslmode (local Postgres in tests) is left alone.
  if (u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "verify-full");
  return u.toString();
}
