import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/db";

type Conn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * One lock per email address, held until the transaction ends. Everything that decides how an address's
 * drop-email consent is recorded across `subscribers` and `customers` takes it before reading either table:
 * the notify-me signup (subscribe) and the first sign-in that converts a subscriber (signIn, PRD 2.7).
 * Without it, a signup racing a first sign-in could leave the two records disagreeing about consent.
 * `email` must already be normalised; call it inside a transaction (outside one it releases at once).
 */
export async function lockEmail(tx: Conn, email: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('email-consent'), hashtext(${email}))`);
}
