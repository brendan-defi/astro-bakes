// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every admin page, route handler and server action must check for an admin
 * itself (src/lib/admin.ts): layouts don't re-run on navigation, and a server
 * action can be posted to any path, so nothing upstream is a boundary. The
 * sign-in pieces run signed out and check the host instead. Several sessions
 * add admin sections in parallel; this catches the one that forgets.
 */
const ROOT = join(process.cwd(), "src/app/admin");
const PUBLIC = new Set(["sign-in/page.tsx", "auth/actions.ts", "auth/verify/route.ts"]);
const GATE = /\brequireAdmin\(/;
const HOST = /\b(?:assertAdminHost|adminHostAllowed)\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const isServerActions = (src: string) => /^\s*["']use server["']/.test(src);
const isEntry = (name: string) => /(?:^|\/)(?:page\.tsx|route\.ts)$/.test(name);

/** What's unguarded in one file: the file itself (page/route) or the names of its exported actions. */
export function unguarded(name: string, src: string): string[] {
  const check = PUBLIC.has(name) ? HOST : GATE;
  if (isServerActions(src)) {
    // Each exported action, up to the next export.
    return src
      .split(/(?=^export\s)/m)
      .filter((chunk) => /^export\s+(?:async\s+)?function\s/.test(chunk))
      .filter((chunk) => !check.test(chunk))
      .map((chunk) => `${name}: ${chunk.match(/function\s+(\w+)/)?.[1] ?? "?"}`);
  }
  if (isEntry(name) && !check.test(src)) return [name];
  return [];
}

describe("admin gate coverage", () => {
  it("every admin page, route and server action calls requireAdmin (sign-in: checks the host)", () => {
    const missing = files(ROOT)
      .filter((f) => /\.(?:ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .flatMap((f) => unguarded(relative(ROOT, f), readFileSync(f, "utf8")));
    expect(missing).toEqual([]);
  });

  it("flags an action, page or route that skips the check", () => {
    const actions = `"use server";\nexport async function ok() { await requireAdmin(); }\nexport async function leaky(id: string) { return id; }\n`;
    expect(unguarded("drops/actions.ts", actions)).toEqual(["drops/actions.ts: leaky"]);
    expect(unguarded("drops/page.tsx", "export default async function Page() { return null; }")).toEqual(["drops/page.tsx"]);
    expect(unguarded("orders/export/route.ts", "export async function GET() { return new Response(); }")).toEqual(["orders/export/route.ts"]);
    expect(unguarded("sign-in/page.tsx", "export default async function Page() { await requireAdmin(); }")).toEqual(["sign-in/page.tsx"]);
    expect(unguarded("drops/DropForm.tsx", "export function DropForm() { return null; }")).toEqual([]);
  });
});
