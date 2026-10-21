"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { saveBoxAction } from "@/app/admin/(app)/boxes/actions";
import { RECOMMENDED_ALLERGENS, REQUIRED_ALLERGENS, type Allergen } from "@/lib/allergens";
import { MAX_RECIPE_LINES, MIN_PRICE, slugify, type BoxValue } from "@/lib/catalogue-rules";
import { describedBy, FieldRow } from "./FieldRow";
import s from "@/app/admin/admin.module.css";

type Text = "slug" | "nameEn" | "nameJa" | "descriptionEn" | "descriptionJa" | "contentsEn" | "contentsJa" | "price" | "defaultCap" | "defaultMaxPerCustomer" | "sort";
interface Line { key: number; itemSlug: string; qty: string }
interface Draft extends Record<Text, string> {
  allergens: string[];
  active: boolean;
  recipe: Line[];
}

let lineKey = 0;
const toDraft = (v: BoxValue): Draft => ({
  slug: v.slug,
  nameEn: v.nameEn,
  nameJa: v.nameJa,
  descriptionEn: v.descriptionEn,
  descriptionJa: v.descriptionJa,
  contentsEn: v.contentsEn,
  contentsJa: v.contentsJa,
  price: String(v.price),
  defaultCap: String(v.defaultCap),
  defaultMaxPerCustomer: String(v.defaultMaxPerCustomer),
  sort: String(v.sort),
  allergens: v.allergens,
  active: v.active,
  recipe: v.recipe.map((l) => ({ key: ++lineKey, itemSlug: l.itemSlug, qty: String(l.qty) })),
});
const EMPTY: BoxValue = { slug: "", nameEn: "", nameJa: "", descriptionEn: "", descriptionJa: "", contentsEn: "", contentsJa: "", price: 0, allergens: [], active: true, defaultCap: 20, defaultMaxPerCustomer: 5, sort: 0, recipe: [] };
/** What the server sees: the draft without React's line keys. */
const payload = (d: Draft) => ({ ...d, recipe: d.recipe.map(({ itemSlug, qty }) => ({ itemSlug, qty })) });
const same = (a: Draft, b: Draft) => JSON.stringify(payload(a)) === JSON.stringify(payload(b));
/** Error keys in the order the form shows them, for focusing the first. */
const ORDER = ["nameEn", "nameJa", "slug", "descriptionEn", "descriptionJa", "price", "recipe", "contentsEn", "contentsJa", "allergens", "defaultCap", "defaultMaxPerCustomer", "sort", "active"];
const fieldId = (key: string) => `box-${key.replace(/\./g, "-")}`;
/** The first recipe-line error in the order the form shows them (line by line, item before quantity). */
const firstLineError = (errors: Record<string, string>) =>
  Object.keys(errors)
    .filter((k) => /^recipe\.\d+\.(item|qty)$/.test(k))
    .sort((a, b) => {
      const [, ai, af] = a.split("."), [, bi, bf] = b.split(".");
      return Number(ai) - Number(bi) || (af === "item" ? -1 : 1) - (bf === "item" ? -1 : 1);
    })[0];

/**
 * Create or edit a box (PRD 4.3). `slug` is null when creating; a new box's slug follows its English name until
 * edited, and is fixed once saved. The recipe (what the kitchen bakes for one box) is separate from the card's
 * contents line, which is copy.
 */
export function BoxForm({ slug, initial, items, created = false }: { slug: string | null; initial: BoxValue | null; items: { slug: string; name: string }[]; created?: boolean }) {
  const router = useRouter();
  const creating = slug === null;
  const [saved, setSaved] = useState<Draft>(() => toDraft(initial ?? { ...EMPTY, recipe: items[0] ? [{ itemSlug: "", qty: 1 }] : [] }));
  const [draft, setDraft] = useState<Draft>(saved);
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(created ? { kind: "saved", text: "Created." } : null);
  const dirty = !same(draft, saved);
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (busy || !focusNext.current) return;
    document.getElementById(fieldId(focusNext.current))?.focus();
    focusNext.current = null;
  }, [busy, errors]);

  const touch = (...keys: string[]) => {
    setStatus(null);
    setErrors((errs) => Object.fromEntries(Object.entries(errs).filter(([k]) => !keys.some((key) => k === key || k.startsWith(`${key}.`)))));
  };
  const set = (key: Text, value: string) => {
    setDraft((d) => ({ ...d, [key]: value, ...(creating && key === "nameEn" && !slugEdited ? { slug: slugify(value) } : {}) }));
    if (key === "slug") setSlugEdited(true);
    touch(key);
  };
  const setLine = (key: number, change: Partial<Line>) => {
    setDraft((d) => ({ ...d, recipe: d.recipe.map((l) => (l.key === key ? { ...l, ...change } : l)) }));
    touch("recipe");
  };
  const toggleAllergen = (name: string, on: boolean) => {
    setDraft((d) => ({ ...d, allergens: on ? [...d.allergens, name] : d.allergens.filter((a) => a !== name) }));
    touch("allergens");
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await saveBoxAction(payload(draft), slug);
      if (!r.ok) {
        setErrors(r.errors);
        setStatus({ kind: "error", text: r.errors.form ?? "Some fields need fixing; they're marked below." });
        focusNext.current = ORDER.find((k) => r.errors[k]) ?? firstLineError(r.errors) ?? null;
        return;
      }
      if (creating) {
        router.push(`/admin/boxes/${r.slug}?created=1`);
        return;
      }
      const next = toDraft(r.value);
      setSaved(next);
      setDraft(next);
      setErrors({});
      setStatus({ kind: "saved", text: "Saved. The shop shows the changes now." });
    } catch {
      setStatus({ kind: "error", text: "Couldn't save. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const text = (key: Text, help?: string, extra: Record<string, unknown> = {}) => ({
    id: fieldId(key),
    className: "input",
    value: draft[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": describedBy(fieldId(key), help, errors[key]),
    ...extra,
  });
  const pair = (en: Text, ja: Text, opts: { textarea?: boolean; rows?: number; placeholderEn?: string; placeholderJa?: string } = {}) => (
    <div className={s.twoCol}>
      {([["en", en, opts.placeholderEn], ["ja", ja, opts.placeholderJa]] as const).map(([lang, key, ph]) => (
        <div key={key}>
          <label htmlFor={fieldId(key)} className={s.lang}>{lang === "en" ? "English" : "日本語"}</label>
          {opts.textarea ? <textarea {...text(key)} rows={opts.rows ?? 3} placeholder={ph} /> : <input {...text(key)} placeholder={ph} />}
          {errors[key] && <p id={`${fieldId(key)}-err`} className={s.fieldError}>{errors[key]}</p>}
        </div>
      ))}
    </div>
  );
  const chosen = new Set(draft.recipe.map((l) => l.itemSlug));
  const allergenGroup = (legend: string, list: Allergen[]) => (
    <fieldset className={s.allergenGroup}>
      <legend>{legend}</legend>
      <div className={s.allergenGrid}>
        {list.map((a) => (
          <label key={a.name} className={s.checkRow}>
            <input type="checkbox" checked={draft.allergens.includes(a.name)} onChange={(e) => toggleAllergen(a.name, e.target.checked)} />
            {a.name} <span className={s.muted}>{a.ja}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
  const help = {
    price: `Tax included, shipping included. At least ¥${MIN_PRICE}.`,
    defaultCap: "How many a drop sells before it shows sold out (D5).",
    defaultMaxPerCustomer: "The most one customer can buy in a drop, across their orders (D7).",
    sort: "Lower numbers come first.",
  };
  const slugHelp = creating ? "Used in links and carts; it can't change once the box is saved." : "Fixed: carts and links use it.";
  const contentsHelp = "The line on the box card, e.g. “1 slice Nebula Banana Bread · 2 cookies”. Separate from the recipe above, so it can be worded freely.";

  return (
    <form onSubmit={submit} noValidate className={s.adminForm} aria-busy={busy}>
      <fieldset disabled={busy} className={s.formFieldset}>
        <section aria-labelledby="box-sec-names" className={`panel ${s.formSection}`}>
          <h2 id="box-sec-names" className={s.sectionTitle}>Name and description</h2>
          <div className={s.fields}>
            <FieldRow label="Name *">{pair("nameEn", "nameJa", { placeholderEn: "4 Cookie Box", placeholderJa: "4種のクッキーボックス" })}</FieldRow>
            <FieldRow id={creating ? fieldId("slug") : undefined} label="Slug" help={slugHelp} error={errors.slug}>
              {creating ? <input {...text("slug", slugHelp, { autoComplete: "off" })} /> : <p className={s.slugValue}>{draft.slug}</p>}
            </FieldRow>
            <FieldRow label="Description" help="One line under the name on the box card.">{pair("descriptionEn", "descriptionJa", { textarea: true })}</FieldRow>
          </div>
        </section>

        <section aria-labelledby="box-sec-recipe" className={`panel ${s.formSection}`}>
          <h2 id="box-sec-recipe" className={s.sectionTitle}>What's inside</h2>
          <p className={s.sectionIntro}>The recipe is what the kitchen bakes for one box; the production sheet adds these up. Items are managed on the Items tab.</p>
          <div className={s.fields}>
            <FieldRow label="Recipe *" error={errors.recipe} errorId={fieldId("recipe") + "-err"}>
              <div className={s.recipe}>
                {draft.recipe.map((l, i) => {
                  const itemKey = `recipe.${i}.item`, qtyKey = `recipe.${i}.qty`;
                  return (
                    <div key={l.key}>
                      <div className={s.recipeRow}>
                        <select
                          id={fieldId(itemKey)}
                          aria-label={`Item ${i + 1}`}
                          className="input"
                          value={l.itemSlug}
                          aria-invalid={errors[itemKey] ? true : undefined}
                          aria-describedby={errors[itemKey] ? `${fieldId(itemKey)}-err` : undefined}
                          onChange={(e) => setLine(l.key, { itemSlug: e.target.value })}
                        >
                          <option value="">Choose an item…</option>
                          {items.map((it) => (
                            <option key={it.slug} value={it.slug} disabled={it.slug !== l.itemSlug && chosen.has(it.slug)}>{it.name}</option>
                          ))}
                        </select>
                        <input
                          id={fieldId(qtyKey)}
                          aria-label={`Quantity of item ${i + 1}`}
                          className="input"
                          inputMode="numeric"
                          value={l.qty}
                          aria-invalid={errors[qtyKey] ? true : undefined}
                          aria-describedby={errors[qtyKey] ? `${fieldId(qtyKey)}-err` : undefined}
                          onChange={(e) => setLine(l.key, { qty: e.target.value })}
                        />
                        <button type="button" className={s.linkBtn} onClick={() => { setDraft((d) => ({ ...d, recipe: d.recipe.filter((x) => x.key !== l.key) })); touch("recipe"); }}>Remove</button>
                      </div>
                      {errors[itemKey] && <p id={`${fieldId(itemKey)}-err`} className={s.fieldError}>{errors[itemKey]}</p>}
                      {errors[qtyKey] && <p id={`${fieldId(qtyKey)}-err`} className={s.fieldError}>Quantity: {errors[qtyKey]}</p>}
                    </div>
                    );
                })}
                {draft.recipe.length < MAX_RECIPE_LINES && (
                  <button
                    type="button"
                    id={fieldId("recipe")}
                    className={s.linkBtn}
                    style={{ alignSelf: "flex-start" }}
                    aria-describedby={errors.recipe ? `${fieldId("recipe")}-err` : undefined}
                    onClick={() => { setDraft((d) => ({ ...d, recipe: [...d.recipe, { key: ++lineKey, itemSlug: "", qty: "1" }] })); touch("recipe"); }}>
                    + Add an item
                  </button>
                )}
                {items.length === 0 && <p className={s.help}>There are no items yet: create them on the Items tab first.</p>}
              </div>
            </FieldRow>
            <FieldRow label="Contents line" help={contentsHelp}>{pair("contentsEn", "contentsJa", { textarea: true, rows: 5 })}</FieldRow>
            <FieldRow label="Allergens" help={`Shown on the box card. The ${REQUIRED_ALLERGENS.length} required items (特定原材料) must be listed when the box contains them.`} error={errors.allergens}>
              {allergenGroup("Required (特定原材料)", REQUIRED_ALLERGENS)}
              {allergenGroup("Recommended (推奨表示)", RECOMMENDED_ALLERGENS)}
            </FieldRow>
          </div>
        </section>

        <section aria-labelledby="box-sec-sale" className={`panel ${s.formSection}`}>
          <h2 id="box-sec-sale" className={s.sectionTitle}>Price and availability</h2>
          <p className={s.sectionIntro}>These are defaults: a drop copies them when it's set up, then keeps its own. Changing them here never changes a drop that already exists.</p>
          <div className={s.fields}>
            <FieldRow id={fieldId("price")} label="Price (税込) *" help={help.price} error={errors.price}>
              <div className={s.withUnit}><span>¥</span><input {...text("price", help.price, { inputMode: "numeric" })} className={`input ${s.numInput}`} /></div>
            </FieldRow>
            <FieldRow id={fieldId("defaultCap")} label="Default cap" help={help.defaultCap} error={errors.defaultCap}>
              <input {...text("defaultCap", help.defaultCap, { inputMode: "numeric" })} className={`input ${s.numInput}`} />
            </FieldRow>
            <FieldRow id={fieldId("defaultMaxPerCustomer")} label="Per customer" help={help.defaultMaxPerCustomer} error={errors.defaultMaxPerCustomer}>
              <input {...text("defaultMaxPerCustomer", help.defaultMaxPerCustomer, { inputMode: "numeric" })} className={`input ${s.numInput}`} />
            </FieldRow>
            <FieldRow id={fieldId("sort")} label="Menu order" help={help.sort} error={errors.sort}>
              <input {...text("sort", help.sort, { inputMode: "numeric" })} className={`input ${s.numInput}`} />
            </FieldRow>
            <FieldRow label="" help="Hidden boxes leave the menu shown between drops. A drop that already carries the box keeps selling it." error={errors.active}>
              <label className={s.checkRow}>
                <input id={fieldId("active")} type="checkbox" checked={draft.active} onChange={(e) => { setDraft((d) => ({ ...d, active: e.target.checked })); touch("active"); }} />
                Active (on the menu)
              </label>
            </FieldRow>
          </div>
        </section>
      </fieldset>
      <div className={s.saveBar}>
        <button type="submit" className={`btn btn-primary ${s.btnSm}`} disabled={busy || (!creating && !dirty)}>{busy ? "Saving…" : creating ? "Create box" : "Save box"}</button>
        <span role="status" aria-live="polite" className={!status ? s.muted : status.kind === "error" ? s.statusError : s.statusOk}>
          {status?.text ?? (dirty && !creating ? "Unsaved changes" : "")}
        </span>
      </div>
    </form>
  );
}
