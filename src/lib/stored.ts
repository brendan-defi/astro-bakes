import { useSyncExternalStore } from "react";

/**
 * Values the browser keeps for us in localStorage or sessionStorage, read with useSyncExternalStore so components
 * render them directly instead of copying them into state from an effect. The server render and hydration see null;
 * React then switches to the saved value. Writes go through writeStored so every reader in this tab re-renders, and
 * other tabs hear about localStorage changes through the `storage` event.
 */
export type StorageArea = "local" | "session";

const listeners = new Set<() => void>();
/** Values whose write failed (storage blocked or full), so this page still sees them even though they can't be saved. */
const unsaved = new Map<string, string | null>();

const storage = (area: StorageArea): Storage => (area === "local" ? window.localStorage : window.sessionStorage);

export function readStored(area: StorageArea, key: string): string | null {
  const id = `${area}:${key}`;
  if (unsaved.has(id)) return unsaved.get(id)!;
  try {
    return storage(area).getItem(key);
  } catch {
    return null;
  }
}

/** Save a value, or remove it with null, and tell this tab's readers. */
export function writeStored(area: StorageArea, key: string, value: string | null): void {
  const id = `${area}:${key}`;
  try {
    if (value === null) storage(area).removeItem(key);
    else storage(area).setItem(key, value);
    unsaved.delete(id);
  } catch {
    unsaved.set(id, value);
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The saved string, or null when nothing is saved and during the server render and hydration. Strings compare by value, so readers only re-render when it changes. */
export function useStored(area: StorageArea, key: string): string | null {
  return useSyncExternalStore(subscribe, () => readStored(area, key), () => null);
}

const never = () => () => {};
/** False during the server render and hydration, true once saved values are being read. */
export function useHydrated(): boolean {
  return useSyncExternalStore(never, () => true, () => false);
}
