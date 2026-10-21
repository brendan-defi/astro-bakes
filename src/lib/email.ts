import "server-only";
import { Resend } from "resend";
import { getDb } from "@/db";
import { notificationLog } from "@/db/schema";
import type { Email } from "./email-templates";
import { contactEmail } from "./settings";

/**
 * The one way email leaves the app (D23: Resend). Every send is recorded in
 * notification_log with the provider's message id or the error (PRD 5.1, 5.3).
 * The transport is swappable so tests capture emails and SES could replace
 * Resend later without touching callers.
 */

export interface OutgoingEmail extends Email {
  to: string;
  /** notification_log.type: sign_in, order_confirmation, … */
  type: string;
  /** `<event>/<entity>`; Resend dedupes retries with it for 24 hours. */
  idempotencyKey: string;
  /**
   * Where a reply goes. Defaults to the store's contact email (Settings → Store), so a customer answering a
   * confirmation reaches the inbox the owner chose rather than the sending address; set it to override (the
   * customer, on a custom-order request to the owner). Internal emails to the owner get none.
   */
  replyTo?: string;
  /** Extra headers, e.g. List-Unsubscribe on drop emails (unsubscribe.ts). */
  headers?: Record<string, string>;
  customerId?: string | null;
  orderId?: string | null;
}

export type SendOutcome = { ok: true; providerMessageId: string | null } | { ok: false; error: string };
export type EmailTransport = (email: OutgoingEmail, from: string) => Promise<SendOutcome>;

const resendTransport: EmailTransport = async (email, from) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  const resend = new Resend(key);
  // The SDK reports API errors in the result, not by throwing.
  const { data, error } = await resend.emails.send(
    { from, to: [email.to], subject: email.subject, html: email.html, text: email.text, ...(email.replyTo ? { replyTo: email.replyTo } : {}), ...(email.headers && Object.keys(email.headers).length ? { headers: email.headers } : {}) },
    { idempotencyKey: email.idempotencyKey },
  );
  if (error) return { ok: false, error: `${error.name}: ${error.message}` };
  return { ok: true, providerMessageId: data?.id ?? null };
};

let transport: EmailTransport = resendTransport;

/** Tests swap the transport to capture what would have been sent. */
export function setEmailTransport(t: EmailTransport | null) {
  transport = t ?? resendTransport;
}

/** "Astro Bakes <hello@astrobakes.xyz>" unless EMAIL_FROM overrides it (e.g. onboarding@resend.dev before the domain verifies). */
export function fromAddress(): string {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  const domain = process.env.RESEND_EMAIL_DOMAIN ?? "astrobakes.xyz";
  return `Astro Bakes <hello@${domain}>`;
}

export async function sendEmail(email: OutgoingEmail): Promise<SendOutcome> {
  let outcome: SendOutcome;
  try {
    const replyTo = email.replyTo ?? (email.type === "internal" ? undefined : await contactEmail().catch(() => undefined));
    outcome = await transport({ ...email, ...(replyTo ? { replyTo } : {}) }, fromAddress());
  } catch (e) {
    outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    await getDb().insert(notificationLog).values({
      type: email.type,
      to: email.to,
      customerId: email.customerId ?? null,
      orderId: email.orderId ?? null,
      providerMessageId: outcome.ok ? outcome.providerMessageId : null,
      error: outcome.ok ? null : outcome.error,
    });
  } catch (e) {
    console.error("notification_log write failed", e);
  }
  if (!outcome.ok) console.error(`email ${email.type} to ${email.to} failed: ${outcome.error}`);
  return outcome;
}
