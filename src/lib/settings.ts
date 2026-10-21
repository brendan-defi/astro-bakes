import "server-only";
import { count, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { drops, inventoryHolds, settings } from "@/db/schema";
import { arrivalDate, effectiveState } from "./data";
import { SETTING_FIELDS, settingValue, type SettingValue } from "./settings-fields";

/**
 * Reading and writing the owner's settings (PRD 4.9) by the field list in
 * settings-fields.ts. The public subset reaches pages through loadSettings()
 * in drops.ts; the private ones (owner email, label sender) are read here,
 * server-side only.
 */

/** Every editable setting, stored value or default, for the admin form. */
export async function settingsForForm(): Promise<Record<string, SettingValue>> {
  const rows = await getDb().select().from(settings);
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(SETTING_FIELDS.map((f) => [f.key, settingValue(f, stored.get(f.key))]));
}

/** Save validated values (validateSettings), one row per key. Keys not in the field list are never written. */
export async function saveSettings(values: Record<string, SettingValue>): Promise<void> {
  const now = new Date();
  const rows = SETTING_FIELDS.filter((f) => f.key in values).map((f) => ({ key: f.key, value: values[f.key], updatedAt: now }));
  if (!rows.length) return;
  await getDb().transaction(async (tx) => {
    for (const row of rows) {
      await tx.insert(settings).values(row).onConflictDoUpdate({ target: settings.key, set: { value: row.value, updatedAt: now } });
    }
  });
}

export const SHIPPING_FEE_LOCKED = "Locked while a drop is open or someone is checking out: their total was shown with the current fee. Change it between drops.";

/**
 * Changes that mustn't be made right now, keyed like validation errors. The shipping fee is one: a checkout's total
 * was shown with the fee as it was, and placing the order reads the fee again, so changing it mid-drop would charge
 * customers a total they never saw. Until checkout quotes shipping itself, the fee only changes between drops.
 */
export async function lockedChanges(values: Record<string, SettingValue>): Promise<Record<string, string>> {
  if (!("shipping_fee" in values)) return {};
  const current = (await read(["shipping_fee"])).shipping_fee;
  if (values.shipping_fee === current || !(await checkoutsInProgress())) return {};
  return { shipping_fee: SHIPPING_FEE_LOCKED };
}

/** Is a drop open, or is any checkout holding stock (a held checkout may still finish just after close)? */
async function checkoutsInProgress(now = new Date()): Promise<boolean> {
  const db = getDb();
  const [held] = await db.select({ n: count() }).from(inventoryHolds).where(gt(inventoryHolds.expiresAt, now));
  if (held.n > 0) return true;
  const all = await db.select({ state: drops.state, openAt: drops.openAt, closeAt: drops.closeAt, shipAt: drops.shipAt }).from(drops);
  return all.some((d) => effectiveState({ ...d, arriveAt: arrivalDate(d.shipAt) }, now) === "open");
}

/** A few settings by key, typed by their fields, defaults filled in. */
async function read<K extends string>(keys: K[]): Promise<Record<K, SettingValue>> {
  const rows = await getDb().select().from(settings).where(inArray(settings.key, keys));
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(keys.map((k) => [k, settingValue(SETTING_FIELDS.find((f) => f.key === k)!, stored.get(k))])) as Record<K, SettingValue>;
}

/** Where owner notifications go (the owner email, else the contact email) and whether to send one per new order. */
export async function ownerNotifications(): Promise<{ to: string; newOrders: boolean }> {
  const v = await read(["owner_email", "contact_email", "notify_new_order"]);
  return { to: (v.owner_email as string) || (v.contact_email as string), newOrders: v.notify_new_order as boolean };
}

/** The store's contact email: shown to customers, and where their replies to our emails go. */
export async function contactEmail(): Promise<string> {
  return (await read(["contact_email"])).contact_email as string;
}

/** Days from a drop's ship date to its expected arrival (D21; next day unless the owner says otherwise). */
export async function arrivalOffsetDays(): Promise<number> {
  return (await read(["arrival_offset_days"])).arrival_offset_days as number;
}
