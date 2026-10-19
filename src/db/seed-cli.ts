import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { seed } from "./seed";
import { withVerifyFull } from "./url";

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set. Run `npx vercel env pull`.");
const pool = new Pool({ connectionString: withVerifyFull(url), max: 1 });

seed(drizzle(pool, { schema, casing: "snake_case" }))
  .then((counts) => console.log("Seeded:", counts))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
