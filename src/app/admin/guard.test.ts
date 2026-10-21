// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A safety net, not the boundary: every admin page, route handler and server
 * action must check for an admin itself (src/lib/admin.ts), because layouts
 * don't re-run on navigation and a server action can be posted to any path.
 * The sign-in pieces run signed out and check the host instead. Several
 * sessions add admin sections in parallel; this catches the entry point that
 * forgets.
 *
 * It reads each file's syntax tree, so comments and strings don't count, and
 * it checks every entry point on its own: each exported action of a
 * "use server" module (functions and arrow functions alike), each HTTP method
 * of a route, a page's default export, and any inline "use server" function.
 * The check must sit directly in the entry point's body, outside nested
 * functions, as `await requireAdmin()`: unawaited, it would gate nothing.
 * An entry point re-exported from another module can't be seen into, so it
 * counts as unguarded, and `export * from` in an entry-point file fails closed:
 * write the gated function in the page, route or actions file itself.
 */
const ROOT = join(process.cwd(), "src/app/admin");
const PUBLIC = new Set(["sign-in/page.tsx", "auth/actions.ts", "auth/verify/route.ts"]);
const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

type Gate = "admin" | "host";
/** The label of an `export * from`: it may export any name, so it stands in for every entry point. */
const WILDCARD = "*";
type Entry = { label: string; body: ts.Node | undefined };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Does this block or file open with a "use server" directive? (Comments are trivia, so they don't get in the way.) */
function usesServer(statements: readonly ts.Statement[]): boolean {
  for (const s of statements) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) return false;
    if (s.expression.text === "use server") return true;
  }
  return false;
}

const callee = (node: ts.Node, name: string) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;

/** Is the gate called in this body itself (not inside a nested function, which might never run)? */
function gated(body: ts.Node | undefined, gate: Gate): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (node !== body && ts.isFunctionLike(node)) return;
    if (gate === "admin" && ts.isAwaitExpression(node) && callee(node.expression, "requireAdmin")) found = true;
    if (gate === "host" && ((ts.isAwaitExpression(node) && callee(node.expression, "assertAdminHost")) || callee(node, "adminHostAllowed"))) found = true;
    ts.forEachChild(node, visit);
  };
  if (body) visit(body);
  return found;
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) => !!ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === kind);

/** The function behind an expression, unwrapping parentheses and type assertions; undefined for any other shape. */
function functionOf(expr: ts.Expression | undefined): ts.FunctionLikeDeclaration | undefined {
  let e = expr;
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e))) e = e.expression;
  return e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) ? e : undefined;
}

/** Every value a module exports, by exported name, with the body that runs when it's called (undefined: can't tell). */
function exportsOf(sf: ts.SourceFile): Entry[] {
  const local = new Map<string, ts.Node | undefined>();
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) local.set(s.name.text, s.body);
    if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) local.set(d.name.text, functionOf(d.initializer)?.body);
  }
  const entries: Entry[] = [];
  for (const s of sf.statements) {
    const exported = hasModifier(s, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(s, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(s) && exported) entries.push({ label: isDefault ? "default" : s.name?.text ?? "?", body: s.body });
    if (ts.isVariableStatement(s) && exported) {
      for (const d of s.declarationList.declarations) entries.push({ label: d.name.getText(sf), body: functionOf(d.initializer)?.body });
    }
    if (ts.isExportAssignment(s)) {
      entries.push({ label: "default", body: ts.isIdentifier(s.expression) ? local.get(s.expression.text) : functionOf(s.expression)?.body });
    }
    if (ts.isExportDeclaration(s) && !s.isTypeOnly) {
      // `export * from` could export anything, so it counts as every name (WILDCARD) and fails closed.
      if (!s.exportClause) entries.push({ label: WILDCARD, body: undefined });
      else if (ts.isNamespaceExport(s.exportClause)) entries.push({ label: s.exportClause.name.text, body: undefined });
      else {
        // Each name keeps its own entry. One re-exported from another module can't be checked here (no body); a local
        // one resolves to its declaration.
        for (const el of s.exportClause.elements) {
          if (!el.isTypeOnly) entries.push({ label: el.name.text, body: s.moduleSpecifier ? undefined : local.get((el.propertyName ?? el.name).text) });
        }
      }
    }
  }
  return entries;
}

/** Inline server actions anywhere in the file: functions whose body opens with "use server". */
function inlineActions(sf: ts.SourceFile): Entry[] {
  const found: Entry[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node) && "body" in node && node.body && ts.isBlock(node.body) && usesServer(node.body.statements)) {
      found.push({ label: `inline action at line ${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`, body: node.body });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** What's unguarded in one file (path relative to src/app/admin): "file: entry point" for each. */
export function unguarded(name: string, src: string): string[] {
  const sf = ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const gate: Gate = PUBLIC.has(name) ? "host" : "admin";
  const base = name.split("/").pop();
  let entries: Entry[] = [];
  if (usesServer(sf.statements)) entries = exportsOf(sf);
  else if (base === "route.ts") entries = exportsOf(sf).filter((e) => HTTP_METHODS.has(e.label) || e.label === WILDCARD);
  else if (base === "page.tsx") entries = exportsOf(sf).filter((e) => e.label === "default" || e.label === WILDCARD);
  entries.push(...inlineActions(sf));
  return entries.filter((e) => !gated(e.body, gate)).map((e) => `${name}: ${e.label}`);
}

describe("admin gate coverage", () => {
  it("every admin page, route method and server action checks for an admin (sign-in: checks the host)", () => {
    const missing = files(ROOT)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .flatMap((f) => unguarded(relative(ROOT, f), readFileSync(f, "utf8")));
    expect(missing).toEqual([]);
  });

  it("checks each exported action, function or arrow, even below a leading comment", () => {
    const src = `// Drop actions.\n"use server";\nimport { requireAdmin } from "@/lib/admin";\nexport async function ok() { await requireAdmin(); }\nexport const save = async (id: string) => { return id; };\nexport async function leaky() { return 1; }\nexport const fine = async () => { await requireAdmin(); };\n`;
    expect(unguarded("drops/actions.ts", src)).toEqual(["drops/actions.ts: save", "drops/actions.ts: leaky"]);
  });

  it("checks each HTTP method of a route on its own", () => {
    const src = `export async function GET() { await requireAdmin(); return new Response(); }\nexport const POST = async () => new Response();\n`;
    expect(unguarded("orders/export/route.ts", src)).toEqual(["orders/export/route.ts: POST"]);
  });

  it("doesn't count a check in a comment or a string, an unawaited one, or one inside a nested function", () => {
    const actions = (body: string) => `"use server";\nexport async function act() { ${body} }\n`;
    expect(unguarded("a/actions.ts", actions("// await requireAdmin();\n"))).toEqual(["a/actions.ts: act"]);
    expect(unguarded("a/actions.ts", actions(`const s = "await requireAdmin()";`))).toEqual(["a/actions.ts: act"]);
    expect(unguarded("a/actions.ts", actions("requireAdmin();"))).toEqual(["a/actions.ts: act"]);
    expect(unguarded("a/actions.ts", actions("const later = async () => { await requireAdmin(); };"))).toEqual(["a/actions.ts: act"]);
  });

  it("checks pages, inline server actions and local re-exports", () => {
    expect(unguarded("drops/page.tsx", "export default async function Page() { return null; }")).toEqual(["drops/page.tsx: default"]);
    expect(unguarded("drops/page.tsx", "const Page = async () => null;\nexport default Page;")).toEqual(["drops/page.tsx: default"]);
    const inline = `export default async function Page() {\n  await requireAdmin();\n  async function save() {\n    "use server";\n    return 1;\n  }\n  return null;\n}\n`;
    expect(unguarded("drops/page.tsx", inline)).toEqual(["drops/page.tsx: inline action at line 3"]);
    const reexport = `"use server";\nasync function save() { return 1; }\nexport { save };\nexport { other } from "./elsewhere";\n`;
    expect(unguarded("a/actions.ts", reexport)).toEqual(["a/actions.ts: save", "a/actions.ts: other"]);
  });

  it("flags pages and route methods re-exported from another module, which it can't see into", () => {
    expect(unguarded("orders/export/route.ts", 'export { GET, POST } from "./handlers";\nexport const dynamic = "force-dynamic";')).toEqual(["orders/export/route.ts: GET", "orders/export/route.ts: POST"]);
    expect(unguarded("orders/export/route.ts", 'export { handle as GET } from "./handlers";')).toEqual(["orders/export/route.ts: GET"]);
    expect(unguarded("orders/page.tsx", 'export { default } from "./OrdersPage";')).toEqual(["orders/page.tsx: default"]);
    expect(unguarded("orders/page.tsx", 'export { OrdersPage as default } from "./OrdersPage";')).toEqual(["orders/page.tsx: default"]);
    // A wildcard could export anything, so it fails closed in an entry-point file.
    expect(unguarded("orders/export/route.ts", 'export * from "./handlers";')).toEqual(["orders/export/route.ts: *"]);
    expect(unguarded("orders/page.tsx", 'export * from "./OrdersPage";')).toEqual(["orders/page.tsx: *"]);
    expect(unguarded("a/actions.ts", '"use server";\nexport * from "./more";')).toEqual(["a/actions.ts: *"]);
    // Type-only re-exports aren't entry points.
    expect(unguarded("orders/page.tsx", 'export type { Props } from "./OrdersPage";\nexport default async function P() { await requireAdmin(); }')).toEqual([]);
  });

  it("holds the signed-out sign-in pieces to the host check instead, and leaves components alone", () => {
    expect(unguarded("sign-in/page.tsx", "export default async function Page() { await requireAdmin(); }")).toEqual(["sign-in/page.tsx: default"]);
    expect(unguarded("sign-in/page.tsx", "export default async function Page() { await assertAdminHost(); }")).toEqual([]);
    expect(unguarded("drops/DropForm.tsx", "export function DropForm() { return null; }")).toEqual([]);
  });
});
