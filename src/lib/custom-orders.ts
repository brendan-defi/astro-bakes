import "server-only";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customOrderRequests, settings } from "@/db/schema";
import { hashIp } from "./auth-rules";
import { settings as defaultSettings, type Locale } from "./data";
import { sendEmail } from "./email";
import { customOrderRequestEmail } from "./email-templates";
import { RATE_PER_EMAIL, RATE_PER_IP, RATE_WINDOW_HOURS, validateCustomOrder, type CustomOrderField, type CustomOrderInput } from "./custom-order-rules";

/**
 * The custom-orders form's write path. The request is stored first, so nothing
 * is lost if the email fails, then the owner gets it by email with Reply-To set
 * to the customer. Rate-limited per email and per IP under advisory locks, the
 * same way as sign-in (auth.ts).
 */

export interface CustomOrderSubmission extends CustomOrderInput {
  locale: Locale;
  /** Honeypot: a field people never see. Anything in it means a bot. */
  website?: string;
}

export interface SubmitContext {
  ip?: string | null;
  customerId?: string | null;
  now?: Date;
}

export type SubmitResult = { ok: true } | { ok: false; error: "invalid"; fields: CustomOrderField[] } | { ok: false; error: "rate_limited" };

export async function submitCustomOrder(input: CustomOrderSubmission, ctx: SubmitContext = {}): Promise<SubmitResult> {
  // Bots that fill the hidden field get the same answer as everyone else, and nothing is stored or sent.
  if (input.website) return { ok: true };
  const v = validateCustomOrder(input, ctx.now);
  if (!v.ok) return { ok: false, error: "invalid", fields: v.fields };
  const r = v.request;
  const locale: Locale = input.locale === "ja" ? "ja" : "en";
  const ipHash = hashIp(ctx.ip);
  const db = getDb();

  // Lock the email, then the IP (always that order), then count and insert, so concurrent sends can't slip past.
  const id = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('custom-order-email'), hashtext(${r.email}))`);
    if (ipHash) await tx.execute(sql`select pg_advisory_xact_lock(hashtext('custom-order-ip'), hashtext(${ipHash}))`);
    const since = new Date((ctx.now ?? new Date()).getTime() - RATE_WINDOW_HOURS * 3_600_000);
    const [byEmail] = await tx.select({ n: count() }).from(customOrderRequests).where(and(eq(customOrderRequests.email, r.email), gt(customOrderRequests.createdAt, since)));
    if (byEmail.n >= RATE_PER_EMAIL) return null;
    if (ipHash) {
      const [byIp] = await tx.select({ n: count() }).from(customOrderRequests).where(and(eq(customOrderRequests.ipHash, ipHash), gt(customOrderRequests.createdAt, since)));
      if (byIp.n >= RATE_PER_IP) return null;
    }
    const [row] = await tx
      .insert(customOrderRequests)
      .values({ ...r, locale, customerId: ctx.customerId ?? null, ipHash, ...(ctx.now ? { createdAt: ctx.now } : {}) })
      .returning({ id: customOrderRequests.id });
    return row.id;
  });
  if (!id) return { ok: false, error: "rate_limited" };

  const sent = await sendEmail({
    ...customOrderRequestEmail({ request: r, locale }),
    to: await ownerInbox(),
    replyTo: r.email,
    type: "custom_order_request",
    idempotencyKey: `custom-order/${id}`,
    customerId: ctx.customerId ?? null,
  });
  if (sent.ok) await db.update(customOrderRequests).set({ notifiedAt: new Date() }).where(eq(customOrderRequests.id, id));
  // The request is saved either way; a failed send shows as notified_at null plus the error in notification_log.
  return { ok: true };
}

/** Where requests go: the custom_order_email setting, else the store's contact email (PRD 4.9). */
export async function ownerInbox(): Promise<string> {
  const rows = await getDb().select().from(settings).where(inArray(settings.key, ["custom_order_email", "contact_email"]));
  const value = (k: string) => rows.find((row) => row.key === k && typeof row.value === "string" && row.value)?.value as string | undefined;
  return value("custom_order_email") ?? value("contact_email") ?? defaultSettings.contactEmail;
}
