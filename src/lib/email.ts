import "server-only";
import { Resend } from "resend";
import { getDb, type Db } from "@/db";
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

/**
 * How long a send may take before it counts as failed. Some callers hold a lock across the send (the welcome
 * email, email-lock.ts), so a slow provider mustn't hold up an unsubscribe or a sign-in for long. A timeout
 * doesn't prove the provider rejected the email, so callers that retry keep the same idempotency key.
 */
const DEFAULT_SEND_TIMEOUT_MS = 10_000;
let sendTimeoutMs = DEFAULT_SEND_TIMEOUT_MS;

/** Tests shorten the deadline to exercise it. */
export function setEmailSendTimeout(ms: number | null) {
  sendTimeoutMs = ms ?? DEFAULT_SEND_TIMEOUT_MS;
}

function withDeadline(send: Promise<SendOutcome>, ms: number): Promise<SendOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<SendOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: `timed out after ${ms} ms (the provider may still deliver it)` }), ms);
  });
  send.catch(() => {}); // a send that settles after the deadline mustn't surface as an unhandled rejection
  return Promise.race([send, late]).finally(() => clearTimeout(timer));
}

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

/** A transaction to write the log row in: a caller holding a lock across the send (the welcome) stays on one connection. */
type LogConn = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function sendEmail(email: OutgoingEmail, opts: { conn?: LogConn } = {}): Promise<SendOutcome> {
  let outcome: SendOutcome;
  try {
    const replyTo = email.replyTo ?? (email.type === "internal" ? undefined : await contactEmail().catch(() => undefined));
    outcome = await withDeadline(transport({ ...email, ...(replyTo ? { replyTo } : {}) }, fromAddress()), sendTimeoutMs);
  } catch (e) {
    outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const row = {
      type: email.type,
      to: email.to,
      customerId: email.customerId ?? null,
      orderId: email.orderId ?? null,
      providerMessageId: outcome.ok ? outcome.providerMessageId : null,
      error: outcome.ok ? null : outcome.error,
    };
    // In the caller's transaction, under a savepoint, so a failed log write can't abort it.
    if (opts.conn) await opts.conn.transaction((sp) => sp.insert(notificationLog).values(row));
    else await getDb().insert(notificationLog).values(row);
  } catch (e) {
    console.error("notification_log write failed", e);
  }
  if (!outcome.ok) console.error(`email ${email.type} to ${email.to} failed: ${outcome.error}`);
  return outcome;
}
