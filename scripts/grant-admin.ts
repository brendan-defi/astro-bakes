import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { withVerifyFull } from "../src/db/url";

/**
 * Give an email the admin role (PRD 5.4), or take it away:
 *
 *   pnpm admin:grant owner@example.com
 *   pnpm admin:grant owner@example.com --revoke
 *
 * Granting creates the customer row if the address has never signed in, so the
 * admin sign-in works straight away. Revoking also ends that person's admin
 * sessions. Prints which database it touched, because .env.local may point at
 * production.
 */
const [email, flag] = process.argv.slice(2).map((a) => a.trim());
const revoke = flag === "--revoke";
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (flag && !revoke)) {
  console.error("Usage: pnpm admin:grant <email> [--revoke]");
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set. Run `npx vercel env pull`.");
const pool = new Pool({ connectionString: withVerifyFull(url), max: 1 });
const db = drizzle(pool, { schema, casing: "snake_case" });
const address = email.toLowerCase();

async function main() {
  console.log(`Database: ${new URL(url!).hostname}`);
  if (revoke) {
    const rows = await db.update(schema.customers).set({ role: "customer", updatedAt: new Date() }).where(eq(schema.customers.email, address)).returning({ id: schema.customers.id });
    if (!rows.length) return console.log(`No customer with email ${address}.`);
    await db.delete(schema.sessions).where(and(eq(schema.sessions.customerId, rows[0].id), eq(schema.sessions.audience, "admin")));
    return console.log(`${address} is no longer an admin; their admin sessions are ended.`);
  }
  await db
    .insert(schema.customers)
    .values({ email: address, role: "admin" })
    .onConflictDoUpdate({ target: schema.customers.email, set: { role: "admin", updatedAt: new Date() } });
  console.log(`${address} is an admin. Sign in at https://admin.astrobakes.xyz.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
