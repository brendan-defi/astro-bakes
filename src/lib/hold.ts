import { settings } from "./data";

/** Mock of InventoryHold.expires_at, kept in sessionStorage so it survives reloads. */
const KEY = "ab-hold-expires";

export function startHold(): number {
  const expires = Date.now() + settings.holdMinutes * 60_000;
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
