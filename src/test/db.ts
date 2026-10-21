import { Pool } from "pg";
import { parse } from "pg-connection-string";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { closeDb } from "@/db";
import { seed } from "@/db/seed";
import { setEmailTransport, type OutgoingEmail } from "@/lib/email";

/**
 * Shared setup for the integration suites (`*.integration.test.ts`), which run
 * the real write paths against the Postgres in TEST_DATABASE_URL and skip
 * without it. Importing this module points the app's lazy client (`getDb`) at
 * the same database.
 *
 * Every suite drops and recreates the `public` schema, so each worktree or
 * session should use its own database (`create database astro_test_<topic>`),
 * and a host that isn't this machine is refused unless
 * TEST_DATABASE_ALLOW_REMOTE=1.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (TEST_DATABASE_URL) {
  assertLocal(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

/**
 * Throws unless the URL connects to a Postgres on this machine; the suites wipe the schema they're given. The host
 * checked is the one node-postgres will actually use: it parses the string with pg-connection-string, where a
 * `?host=` parameter overrides the URL's hostname, and an empty host falls back to PGHOST, so that's refused too.
 * A local port can still be a tunnel to somewhere else; this catches the pasted-URL mistake, not that.
 */
export function assertLocal(url: string, allowRemote = process.env.TEST_DATABASE_ALLOW_REMOTE === "1") {
  if (allowRemote) return;
  const host = parse(url).host ?? "";
  // A Unix socket path is on this machine by definition.
  if (LOCAL_HOSTS.has(host) || host.startsWith("/")) return;
  throw new Error(`TEST_DATABASE_URL connects to ${host || "an unnamed host"}; the integration tests drop its public schema. Use a local database, or set TEST_DATABASE_ALLOW_REMOTE=1 if this really is a throwaway.`);
}

/** A Drizzle client for the suite's own queries (null pool and a placeholder db when skipped). */
export function testDb(max = 2) {
  const pool = TEST_DATABASE_URL ? new Pool({ connectionString: TEST_DATABASE_URL, max }) : null;
  const db = pool ? drizzle(pool, { schema, casing: "snake_case" }) : null!;
  return { pool, db };
}

export type TestDb = ReturnType<typeof testDb>["db"];

/** Start from nothing so regenerated migrations never collide with stale state, then migrate and seed. */
export async function resetDatabase(db: TestDb) {
  await db.execute(sql`drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade`);
  await migrate(db, { migrationsFolder: "drizzle" });
  await seed(db);
}

/** Truncate the given tables (cascading) and remove the `@test.invalid` customers they referenced. */
export async function clearTestData(db: TestDb, tables: string[]) {
  if (tables.length) await db.execute(sql.raw(`truncate ${tables.join(", ")} cascade`));
  await db.execute(sql`delete from customers where email like '%@test.invalid'`);
}

/**
 * Capture outgoing email instead of sending it. Captured messages land in
 * `sent`; while `failing` is set, sends return the given error (and, with
 * `recordFailures`, are still captured).
 */
export function captureEmail({ recordFailures = false } = {}) {
  const sent: OutgoingEmail[] = [];
  const state = { sent, failing: null as string | null, reset() { sent.length = 0; state.failing = null; } };
  setEmailTransport(async (email) => {
    if (state.failing && !recordFailures) return { ok: false, error: state.failing };
    sent.push(email);
    return state.failing ? { ok: false, error: state.failing } : { ok: true, providerMessageId: `msg_${sent.length}` };
  });
  return state;
}

/** Undo the email capture and release both pools so the process can exit. */
export async function closeTestDb(pool: Pool | null) {
  setEmailTransport(null);
  await closeDb();
  await pool?.end();
}
