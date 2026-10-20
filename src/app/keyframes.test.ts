import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Next (Lightning CSS) renames every animation name inside a .module.css file, references included,
 * so a module that names a global @keyframes points at nothing and the animation silently never runs.
 * (The ticker, hero bob/spin and cart badge pop were dead this way.) Every stylesheet must define the
 * keyframes it uses.
 */

const KEYWORDS = new Set(["none", "infinite", "linear", "both", "forwards", "backwards", "reverse", "alternate", "normal", "running", "paused", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end"]);

function animationNames(css: string): string[] {
  const names = new Set<string>();
  for (const [, value] of css.matchAll(/animation(?:-name)?\s*:([^;}]+)/g)) {
    for (const part of value.split(",")) {
      for (const raw of part.trim().split(/\s+/)) {
        const token = raw.replace(/!important$/, "");
        if (!token || KEYWORDS.has(token) || /^[\d.]+m?s$/.test(token) || /^(var|cubic-bezier|linear|steps)\(/.test(token) || /^[\d.]+$/.test(token)) continue;
        names.add(token);
      }
    }
  }
  return [...names];
}
const keyframes = (css: string) => new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(([, name]) => name));

const sheets = [
  ...readdirSync(join(process.cwd(), "src/components")).filter((f) => f.endsWith(".css")).map((f) => join("src/components", f)),
  "src/app/globals.css",
];

describe("CSS keyframes", () => {
  it.each(sheets)("%s defines every keyframe it animates with", (file) => {
    const css = readFileSync(join(process.cwd(), file), "utf8");
    const defined = keyframes(css);
    expect(animationNames(css).filter((name) => !defined.has(name))).toEqual([]);
  });
});
