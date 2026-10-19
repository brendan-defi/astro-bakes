/** The hold expiry the server returned, kept in sessionStorage so the countdown survives reloads (D8). */
const KEY = "ab-hold-expires";
const FALLBACK_MINUTES = 10;

/** Record the server's expiry; without one (deep links to later steps) start a client-only timer. */
export function startHold(expires: number = Date.now() + FALLBACK_MINUTES * 60_000): number {
  try { window.sessionStorage.setItem(KEY, String(expires)); } catch {}
  return expires;
}

export function readHold(): number | null {
  try {
    const v = window.sessionStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch { return null; }
}

export function clearHold() {
  try { window.sessionStorage.removeItem(KEY); } catch {}
}
