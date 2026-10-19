/**
 * What the server told us when the holds were taken, kept in sessionStorage so
 * the countdown survives reloads and stays per tab (D8). The checkout id and
 * revision bind an order submission to exactly the reservation this tab saw.
 */
const KEY = "ab-hold";
const FALLBACK_MINUTES = 10;

export interface Hold {
  expires: number;
  checkoutId: string | null;
  revision: number | null;
}

/** Record the server's hold; without one (deep links to later steps) start a client-only timer that can't place an order. */
export function startHold(h?: Partial<Hold>): Hold {
  const hold: Hold = { expires: h?.expires ?? Date.now() + FALLBACK_MINUTES * 60_000, checkoutId: h?.checkoutId ?? null, revision: h?.revision ?? null };
  try { window.sessionStorage.setItem(KEY, JSON.stringify(hold)); } catch {}
  return hold;
}

export function readHold(): Hold | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as Partial<Hold>;
    return typeof h.expires === "number" ? { expires: h.expires, checkoutId: h.checkoutId ?? null, revision: h.revision ?? null } : null;
  } catch { return null; }
}

export function clearHold() {
  try { window.sessionStorage.removeItem(KEY); } catch {}
}
