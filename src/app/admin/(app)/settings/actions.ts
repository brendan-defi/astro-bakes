"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { saveSettings } from "@/lib/settings";
import { validateSettings, type SettingValue } from "@/lib/settings-fields";

export type SaveSettingsResult = { ok: true; values: Record<string, SettingValue> } | { ok: false; errors: Record<string, string> };

/** Validate and save the whole form; every page reads settings, so the whole site is refreshed. */
export async function saveSettingsAction(input: Record<string, unknown>): Promise<SaveSettingsResult> {
  await requireAdmin();
  const r = validateSettings(input);
  if (!r.ok) return r;
  await saveSettings(r.values);
  revalidatePath("/", "layout");
  return r;
}
