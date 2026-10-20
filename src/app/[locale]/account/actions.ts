"use server";

import { revalidatePath } from "next/cache";
import { currentCustomer } from "@/lib/auth";
import { cancelOrder, setMarketingOptIn, updateProfile, type CancelResult, type ProfileInput, type ProfileResult } from "@/lib/account";

/** Every account action is scoped to the session's customer; without one it simply reports signed_out. */
export async function updateProfileAction(input: ProfileInput): Promise<ProfileResult | { ok: false; error: "signed_out" }> {
  const me = await currentCustomer();
  if (!me) return { ok: false, error: "signed_out" };
  const r = await updateProfile(me.id, input);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function setMarketingOptInAction(optIn: boolean): Promise<{ ok: boolean }> {
  const me = await currentCustomer();
  if (!me) return { ok: false };
  await setMarketingOptIn(me.id, optIn);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cancelOrderAction(number: string): Promise<CancelResult | { ok: false; error: "signed_out" }> {
  const me = await currentCustomer();
  if (!me) return { ok: false, error: "signed_out" };
  const r = await cancelOrder(me.id, number);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
