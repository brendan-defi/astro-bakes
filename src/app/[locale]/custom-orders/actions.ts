"use server";

import { headers } from "next/headers";
import { currentCustomer } from "@/lib/auth";
import { submitCustomOrder, type CustomOrderSubmission, type SubmitResult } from "@/lib/custom-orders";

/** The custom-orders form. Open to everyone; a signed-in sender's request is linked to their account. */
export async function submitCustomOrderAction(input: CustomOrderSubmission): Promise<SubmitResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const me = await currentCustomer();
  return submitCustomOrder(input, { ip, customerId: me?.id ?? null });
}
