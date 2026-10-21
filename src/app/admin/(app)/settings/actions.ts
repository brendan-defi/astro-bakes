"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { lockedChanges, saveSettings } from "@/lib/settings";
import { validateSettings, type SettingValue } from "@/lib/settings-fields";

export type SaveSettingsResult = { ok: true; values: Record<string, SettingValue> } | { ok: false; errors: Record<string, string> };

/** Validate and save the whole form; every page reads settings, so the whole site is refreshed. */
export async function saveSettingsAction(input: Record<string, unknown>): Promise<SaveSettingsResult> {
  await requireAdmin();
  const r = validateSettings(input);
  if (!r.ok) return r;
  const locked = await lockedChanges(r.values);
  if (Object.keys(locked).length) return { ok: false, errors: locked };
  await saveSettings(r.values);
  revalidatePath("/", "layout");
  return r;
}
