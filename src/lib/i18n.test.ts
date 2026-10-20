import { describe, expect, it } from "vitest";
import { getStrings, type Strings } from "./i18n";

const en = getStrings("en");
const ja = getStrings("ja");
const keys = Object.keys(en) as (keyof Strings)[];

/** Every template string, keyed to the argument types it actually takes. */
type Samples = { [K in keyof Strings as Strings[K] extends (...a: never[]) => string ? K : never]: Strings[K] extends (...a: infer A) => string ? A : never };

/**
 * Typed sample arguments for every template: adding a template without one fails the typecheck. The text
 * inputs are ASCII, so any Japanese in a rendered JA string comes from the template itself.
 */
const SAMPLES: Samples = {
  dropIsOpen: ["Drop 03"],
  leftCount: [3],
  allergen: ["Egg"],
  boxCount: [2],
  shippingSuffix: ["¥800"],
  chipShipping: ["¥800"],
  notifyDoneSub: ["you@example.com"],
  tickerOpen: [3],
  tickerCloses: [2],
  tickerShips: ["OCT 25"],
  tickerStatus: [3, 2, "OCT 25"],
  tickerSentence: [["DROP 03 IS OPEN", "TOKYO 23 WARDS"]],
  heldAria: ["9:52"],
  shipsArrives: ["Sun, Oct 25", "Mon, Oct 26"],
  shipsByPost: ["Sun, Oct 25", "Mon, Oct 26"],
  recheckGone: ["Sampler Box"],
  recheckCut: [2, "4 Cookie Boxes", 3, 2],
  boxNames: ["4 Cookie Box"],
  sentTo: ["you@example.com"],
  resendIn: ["0:25"],
  weDeliverTo: ["Meguro-ku"],
  cancelPolicy: ["Sun, Oct 18 · 21:00 JST"],
  placeOrderCard: ["¥2,300"],
  confirmed: ["AB-003-017", "you@example.com"],
  orderPageTitle: ["AB-003-017"],
  toAddress: ["Hanako", "1-2-3 Nakameguro"],
  next4Sub: ["Hanako"],
  signedInAs: ["you@example.com"],
  confirmSignInBody: ["y**@example.com"],
  confirmReplaces: ["me@example.com"],
  limitReached: [3, "4 Cookie Box", 5],
  placedOn: ["Mon, Oct 12"],
  dropN: [4],
  tickerOpens: [4, "SUN NOV 8, 10:00 JST"],
  tickerClosed: [3],
  tickerNextDrop: ["SUN NOV 8"],
  eyebrowClosed: ["Drop 03"],
  opensIn: ["Drop 04"],
  boxesAndShipping: [3, "¥800"],
  boxesShippingIncluded: [3],
  dropClosed: ["Drop 03"],
  everyOrderShips: ["Sun, Oct 25"],
  yourBoxesShip: [2, "Sun, Oct 25"],
  arrivingOrder: ["Mon, Oct 26", "AB-003-017"],
  remindLabel: ["Drop 04"],
  notifyLabelNext: ["Drop 04"],
  onListFor: ["Drop 04"],
  bubbleScheduled: ["Sunday", "10"],
  comingIn: ["Drop 04"],
  orderFrom: ["Sun, Nov 8 · 10:00 JST"],
  requestSentBody: ["Hanako", "you@example.com"],
};

/** The text behind a key as [id, text] pairs: the string, the template rendered with its samples, or each entry of a lookup table. */
function texts(s: Strings, k: keyof Strings): [string, string][] {
  const v: unknown = s[k];
  if (typeof v === "string") return [[k, v]];
  // SAMPLES is checked against each template's parameters above; only this lookup is dynamic.
  if (typeof v === "function") return [[k, (v as (...a: unknown[]) => string)(...(SAMPLES as Record<string, unknown[]>)[k])]];
  return Object.entries(v as Record<string, string>).map(([sub, text]) => [`${k}.${sub}`, text]);
}

/** Identical in both languages on purpose: Japanese-only on the EN page too (tagline, 税込, legal page titles, the address example) or a brand name. */
const SAME = new Set<keyof Strings>(["heroTagline", "taxIncl", "tokushoho", "privacy", "terms", "buildingPlaceholder", "instagram", "line", "copyright", "paypay"]);
/** Helpers that reshape their input rather than carry copy; tested on their own below. */
const HELPERS = new Set<keyof Strings>(["boxNames", "tickerSentence", "metaTitleTemplate"]);
/** Hiragana, katakana or kanji. */
const JAPANESE = /[぀-ヿ一-鿿]/;

describe("Japanese strings", () => {
  it("translates every string that isn't shared on purpose", () => {
    const untranslated = keys
      .filter((k) => !SAME.has(k) && !HELPERS.has(k))
      .flatMap((k) => {
        const english = new Map(texts(en, k));
        return texts(ja, k).filter(([id, text]) => text === english.get(id) || !JAPANESE.test(text)).map(([id]) => id);
      });
    expect(untranslated).toEqual([]);
  });

  it("keeps the shared strings shared", () => {
    for (const k of SAME) expect(texts(ja, k)).toEqual(texts(en, k));
  });
});

describe("templates at their boundaries", () => {
  it("counts boxes: English singular and plural, Japanese counter", () => {
    expect([en.boxCount(1), en.boxCount(2)]).toEqual(["1 box", "2 boxes"]);
    expect([en.yourBoxesShip(1, "Sun, Oct 25"), en.yourBoxesShip(3, "Sun, Oct 25")]).toEqual(["Your 1 box ships Sun, Oct 25", "Your 3 boxes ship Sun, Oct 25"]);
    expect(en.boxesAndShipping(1, "¥800")).toBe("1 box · ¥800 shipping");
    expect([ja.boxCount(1), ja.boxCount(12)]).toEqual(["1箱", "12箱"]);
  });

  it("pads drop numbers to two digits", () => {
    expect([en.dropN(4), en.dropN(12), ja.dropN(4)]).toEqual(["Drop 04", "Drop 12", "ドロップ04"]);
    expect(en.tickerOpen(4)).toBe("DROP 04 IS OPEN");
  });

  it("says today and tomorrow for 0 and 1 days, and counts from 2", () => {
    expect([0, 1, 2].map(en.tickerCloses)).toEqual(["CLOSES TODAY", "CLOSES TOMORROW", "CLOSES IN 2 DAYS"]);
    expect([0, 1, 2].map(ja.tickerCloses)).toEqual(["本日締切", "明日締切", "締切まであと2日"]);
    expect(en.tickerStatus(3, 0, "OCT 25")).toBe("Drop 03 is open. Closes today. Ships OCT 25.");
    expect(en.tickerStatus(3, 1, "OCT 25")).toBe("Drop 03 is open. Closes tomorrow. Ships OCT 25.");
    expect(en.tickerStatus(3, 4, "OCT 25")).toBe("Drop 03 is open. Closes in 4 days. Ships OCT 25.");
    expect(ja.tickerStatus(3, 0, "10月25日")).toBe("ドロップ03受付中。本日締切。10月25日発送。");
    expect(ja.tickerStatus(3, 4, "10月25日")).toBe("ドロップ03受付中。締切まであと4日。10月25日発送。");
  });

  it("puts the brand after each page title, once, with the language's own separator", () => {
    const title = (template: string, page: string) => template.replace("%s", page);
    expect(en.metaTitleTemplate.split("%s")).toHaveLength(2);
    expect(ja.metaTitleTemplate.split("%s")).toHaveLength(2);
    expect(title(en.metaTitleTemplate, en.checkoutTitle)).toBe("Checkout · Astro Bakes");
    expect(title(ja.metaTitleTemplate, ja.checkoutTitle)).toBe("ご注文手続き｜Astro Bakes");
  });

  it("joins the ticker into one sentence per language", () => {
    expect(en.tickerSentence(["BETWEEN DROPS", "TOKYO 23 WARDS"])).toBe("BETWEEN DROPS. TOKYO 23 WARDS.");
    expect(ja.tickerSentence(["ドロップお休み中", "東京23区限定"])).toBe("ドロップお休み中。東京23区限定。");
  });

  it("reads the opening hour naturally in the speech bubble", () => {
    expect(ja.bubbleScheduled("日曜日", "10")).toBe("日曜日の10時オープン！");
    expect(ja.bubbleScheduled("日曜日", "10:30")).toBe("日曜日の10:30オープン！");
    expect(en.bubbleScheduled("Sunday", "10:30")).toBe("Opens Sunday at 10:30!");
  });

  it("labels allergens in Japanese, case-insensitively, and passes unknown ones through", () => {
    expect(["Egg", "Milk", "Wheat", "Walnut"].map(ja.allergen)).toEqual(["卵", "乳", "小麦", "くるみ"]);
    expect(ja.allergen(" walnut ")).toBe("くるみ");
    expect(ja.allergen("Lupin")).toBe("Lupin");
    expect(en.allergen("Egg")).toBe("Egg");
  });

  it("only pluralises box names in English", () => {
    expect(en.boxNames("4 Cookie Box")).toBe("4 Cookie Boxes");
    expect(en.boxNames("Nebula Banana Bread")).toBe("Nebula Banana Bread");
    expect(ja.boxNames("4種のクッキーボックス")).toBe("4種のクッキーボックス");
  });
});
