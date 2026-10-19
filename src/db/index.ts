import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";

/**
 * Lazy Drizzle client over a pg Pool on the pooled Neon URL. Lazy so that
 * `next build` (which imports modules without DATABASE_URL) never connects;
 * attachDatabasePool lets Vercel's Fluid compute drain the pool cleanly.
 */
function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run `npx vercel env pull` to fetch it.");
  const pool = new Pool({ connectionString: url, max: 5 });
  attachDatabasePool(pool);
  return drizzle(pool, { schema, casing: "snake_case" });
}

let db: ReturnType<typeof create> | null = null;

export function getDb() {
  if (!db) db = create();
  return db;
}

export type Db = ReturnType<typeof getDb>;
