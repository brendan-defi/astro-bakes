"use server";

import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { unsubscribe, verifyUnsubscribe } from "@/lib/unsubscribe";

/** The unsubscribe page's button: re-checks the signed values, unsubscribes, and shows the done page. */
export async function confirmUnsubscribeAction(form: FormData): Promise<void> {
  const l = form.get("locale");
  const locale = typeof l === "string" && isLocale(l) ? l : "en";
  const email = verifyUnsubscribe(form.get("e"), form.get("t"));
  if (!email) redirect(`/${locale}/unsubscribe`);
  await unsubscribe(email);
  redirect(`/${locale}/unsubscribe?done=1`);
}
