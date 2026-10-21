"use server";

import { subscribe, type SubscribeInput, type SubscribeResult } from "@/lib/subscribe";

/** The homepage notify-me forms (PRD 1.5). Open to everyone; a database error is reported, not thrown. */
export async function subscribeAction(input: SubscribeInput): Promise<SubscribeResult | { ok: false; error: "failed" }> {
  try {
    return await subscribe(input);
  } catch (e) {
    console.error("subscribe failed", e);
    return { ok: false, error: "failed" };
  }
}
