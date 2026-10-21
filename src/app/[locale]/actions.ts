"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { retryPendingWelcomes, subscribe, type SubscribeInput, type SubscribeResult } from "@/lib/subscribe";

/** The homepage notify-me forms (PRD 1.5). Open to everyone; a database error is reported, not thrown. */
export async function subscribeAction(input: SubscribeInput): Promise<SubscribeResult | { ok: false; error: "failed" }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const result = await subscribe(input, { ip });
    // After the reply: a few welcomes that failed earlier get another go, with no scheduler needed.
    after(() => retryPendingWelcomes().catch((e) => console.error("welcome retry failed", e)));
    return result;
  } catch (e) {
    console.error("subscribe failed", e);
    return { ok: false, error: "failed" };
  }
}
