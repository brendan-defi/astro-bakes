import { defineConfig } from "drizzle-kit";
import { withVerifyFull } from "./src/db/url";

// Migrations use the direct (unpooled) connection per Neon's guidance.
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set. Run `npx vercel env pull`, then use the pnpm db:* scripts.");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url: withVerifyFull(url) },
  strict: true,
  verbose: true,
});
