import { COOKIE, PAW_PAD, PAW_TOES, STAR_PATH } from "@/components/icons";

/**
 * Sticker-style particle art: flat fills with ink outlines, like the cookie and stars in the hero.
 * The SVG strings are our own constants (never user input), parsed once per kind and cloned per particle.
 */

export type ParticleKind = "egg" | "milk" | "wheat" | "walnut" | "cookie" | "crumb" | "sprinkle" | "heart" | "paw" | "star";

const INK = "var(--ink)";
/** Colours a tintable particle (sprinkles, stars) picks from at random. */
const TINTS = ["var(--pink)", "var(--aqua)", "var(--butter)", "var(--lilac)"] as const;

const grains = [[12.3, 11.5, -35], [19.7, 11.5, 35], [12.3, 17, -35], [19.7, 17, 35], [12.3, 22.5, -35], [19.7, 22.5, 35]]
  .map(([cx, cy, a]) => `<ellipse cx="${cx}" cy="${cy}" rx="2.4" ry="3.8" transform="rotate(${a} ${cx} ${cy})"/>`).join("");

/** Each kind's markup and its size in px before the random scale. `var(--c)` is the per-particle tint, from `tints` or TINTS. */
const ART: Record<ParticleKind, { svg: string; size: number; tints?: readonly string[] }> = {
  egg: {
    size: 28,
    svg: `<svg viewBox="0 0 32 32"><path d="M16 3.5c-5.6 0-9.5 8.4-9.5 14.2a9.5 9.5 0 0 0 19 0C25.5 11.9 21.6 3.5 16 3.5z" fill="#fff8e6" stroke="${INK}" stroke-width="2.5"/><path d="M11.6 12.6c.8-2 2-3.6 3.3-4.3" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".35"/></svg>`,
  },
  milk: {
    size: 30,
    svg: `<svg viewBox="0 0 32 32"><path d="M12 4.5h8V8.5l3.5 4.5v13.5a2.5 2.5 0 0 1-2.5 2.5H11a2.5 2.5 0 0 1-2.5-2.5V13L12 8.5z" fill="#fff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M10 16.5h12v6H10z" fill="var(--aqua)"/><path d="M11 4h10" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></svg>`,
  },
  wheat: {
    size: 32,
    svg: `<svg viewBox="0 0 32 32"><path d="M16 30V9" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><g fill="#f2c14e" stroke="${INK}" stroke-width="1.8"><ellipse cx="16" cy="6.5" rx="2.6" ry="4"/>${grains}</g></svg>`,
  },
  walnut: {
    // A kernel half: two wrinkled lobes (a whole shell read as a coffee bean).
    size: 30,
    svg: `<svg viewBox="0 0 32 32"><path d="M16 6.5c-1.4-2.2-4.6-2.6-6.5-1-1.6-.4-3.6.6-4 2.6-1.8.9-2.4 3.2-1.4 4.9-1.2 1.6-.8 4 .9 5-.3 2 1 3.9 3 4.1.6 1.9 2.7 2.9 4.5 2.2 1 1.6 2.6 2.3 3.5 1.2.9 1.1 2.5.4 3.5-1.2 1.8.7 3.9-.3 4.5-2.2 2-.2 3.3-2.1 3-4.1 1.7-1 2.1-3.4.9-5 1-1.7.4-4-1.4-4.9-.4-2-2.4-3-4-2.6-1.9-1.6-5.1-1.2-6.5 1z" fill="#e2b276" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><g fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"><path d="M16 7v18"/><path d="M11.5 9.5c-1.5 1.2-1 3 .6 3.6M8.5 14.5c1.7.6 1.5 2.6 3.4 3M11 20.5c1-1 2.6-.6 3 .8M20.5 9.5c1.5 1.2 1 3-.6 3.6M23.5 14.5c-1.7.6-1.5 2.6-3.4 3M21 20.5c-1-1-2.6-.6-3 .8" opacity=".7"/></g></svg>`,
  },
  cookie: {
    size: 26,
    svg: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="${COOKIE.dough}" stroke="${INK}" stroke-width="4"/>${COOKIE.chips.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COOKIE.chip}"/>`).join("")}</svg>`,
  },
  crumb: {
    size: 13,
    svg: `<svg viewBox="0 0 32 32"><path d="M8 13l8-6 9 6-2 10-9 3-7-6z" fill="${COOKIE.dough}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
  },
  sprinkle: {
    size: 14,
    svg: `<svg viewBox="0 0 32 32"><rect x="11.5" y="3" width="9" height="26" rx="4.5" fill="var(--c)" stroke="${INK}" stroke-width="2.5"/></svg>`,
  },
  heart: {
    size: 22,
    svg: `<svg viewBox="0 0 32 32"><path d="M16 27S4 19.5 4 11.5A6.5 6.5 0 0 1 16 8a6.5 6.5 0 0 1 12 3.5C28 19.5 16 27 16 27z" fill="var(--pink)" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
  },
  paw: {
    size: 24,
    tints: ["var(--butter)", "var(--aqua)", "var(--white)", "var(--pink)"],
    svg: `<svg viewBox="0 0 24 24"><g fill="var(--c)" stroke="${INK}" stroke-width="1.3">${PAW_TOES.map(([cx, cy]) => `<ellipse cx="${cx}" cy="${cy}" rx="2.2" ry="2.8"/>`).join("")}<path d="${PAW_PAD}"/></g></svg>`,
  },
  star: {
    size: 22,
    svg: `<svg viewBox="0 0 48 48"><path d="${STAR_PATH}" fill="var(--c)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`,
  },
};

const templates = new Map<ParticleKind, SVGSVGElement>();

/** A fresh, absolutely positioned SVG for one particle, `scale` × the kind's base size, with a random tint. */
export function particleNode(kind: ParticleKind, scale = 1): { node: SVGSVGElement; size: number } {
  let tpl = templates.get(kind);
  if (!tpl) {
    const holder = document.createElement("template");
    holder.innerHTML = ART[kind].svg;
    tpl = holder.content.firstElementChild as SVGSVGElement;
    templates.set(kind, tpl);
  }
  const node = tpl.cloneNode(true) as SVGSVGElement;
  const size = Math.round(ART[kind].size * scale);
  node.setAttribute("width", String(size));
  node.setAttribute("height", String(size));
  const tints = ART[kind].tints ?? TINTS;
  node.style.cssText = `position:absolute;overflow:visible;--c:${tints[Math.floor(Math.random() * tints.length)]}`;
  return { node, size };
}

/** Which particle an allergen pill throws. Keys are the English names stored on boxes; anything unmapped gets sprinkles. */
const ALLERGEN_KINDS: Record<string, ParticleKind> = {
  egg: "egg",
  milk: "milk",
  wheat: "wheat",
  buckwheat: "wheat",
  walnut: "walnut",
  peanut: "walnut",
  almond: "walnut",
  cashew: "walnut",
  macadamia: "walnut",
};
export function allergenKind(allergen: string): ParticleKind {
  return ALLERGEN_KINDS[allergen.trim().toLowerCase()] ?? "sprinkle";
}
