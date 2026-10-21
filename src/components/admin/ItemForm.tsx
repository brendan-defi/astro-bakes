"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { saveItemAction } from "@/app/admin/(app)/items/actions";
import { slugify } from "@/lib/catalogue-rules";
import { describedBy, FieldRow } from "./FieldRow";
import s from "@/app/admin/admin.module.css";

interface Draft {
  slug: string;
  nameEn: string;
  nameJa: string;
  productionUnit: string;
  unitsPerProductionUnit: string;
}
const ORDER: (keyof Draft)[] = ["slug", "nameEn", "nameJa", "productionUnit", "unitsPerProductionUnit"];
const toDraft = (v: { slug: string; nameEn: string; nameJa: string; productionUnit: string; unitsPerProductionUnit: number }): Draft => ({ ...v, unitsPerProductionUnit: String(v.unitsPerProductionUnit) });
const EMPTY: Draft = { slug: "", nameEn: "", nameJa: "", productionUnit: "", unitsPerProductionUnit: "1" };

/**
 * Create or edit an item (PRD 4.3): what the kitchen bakes, and how it's counted. `slug` is null when creating; a new
 * item's slug follows its English name until edited, and is fixed once saved.
 */
export function ItemForm({ slug, initial, created = false }: { slug: string | null; initial: Parameters<typeof toDraft>[0] | null; created?: boolean }) {
  const router = useRouter();
  const creating = slug === null;
  const [saved, setSaved] = useState<Draft>(() => (initial ? toDraft(initial) : EMPTY));
  const [draft, setDraft] = useState<Draft>(saved);
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(created ? { kind: "saved", text: "Created." } : null);
  const dirty = ORDER.some((k) => draft[k] !== saved[k]);
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (busy || !focusNext.current) return;
    document.getElementById(`item-${focusNext.current}`)?.focus();
    focusNext.current = null;
  }, [busy, errors]);

  const set = (key: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value, ...(creating && key === "nameEn" && !slugEdited ? { slug: slugify(value) } : {}) }));
    if (key === "slug") setSlugEdited(true);
    setStatus(null);
    setErrors(({ [key]: _gone, ...rest }) => rest);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await saveItemAction({ ...draft }, slug);
      if (!r.ok) {
        setErrors(r.errors);
        setStatus({ kind: "error", text: r.errors.form ?? "Some fields need fixing; they're marked below." });
        focusNext.current = ORDER.find((k) => r.errors[k]) ?? null;
        return;
      }
      if (creating) {
        router.push(`/admin/items/${r.slug}?created=1`);
        return;
      }
      const next = toDraft(r.value);
      setSaved(next);
      setDraft(next);
      setErrors({});
      setStatus({ kind: "saved", text: "Saved." });
    } catch {
      setStatus({ kind: "error", text: "Couldn't save. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const input = (key: keyof Draft, extra: Record<string, unknown> = {}, help?: string) => ({
    id: `item-${key}`,
    className: "input",
    value: draft[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": describedBy(`item-${key}`, help, errors[key]),
    ...extra,
  });
  const unitsHelp = "How many go into one of what you bake: 12 slices per cake, 1 cookie per cookie.";
  const slugHelp = creating ? "Used in links and carts; it can't change once the item is saved." : "Fixed: carts and links use it.";

  return (
    <form onSubmit={submit} noValidate className={s.adminForm} aria-busy={busy}>
      <fieldset disabled={busy} className={s.formFieldset}>
        <section className={`panel ${s.formSection}`}>
          <div className={s.fields}>
            <FieldRow id="item-nameEn" label="Name (English) *" error={errors.nameEn}>
              <input {...input("nameEn")} placeholder="Chocolate chip cookie" />
            </FieldRow>
            <FieldRow id="item-nameJa" label="Name (Japanese) *" error={errors.nameJa}>
              <input {...input("nameJa")} placeholder="チョコチップクッキー" />
            </FieldRow>
            <FieldRow id={creating ? "item-slug" : undefined} label="Slug" help={slugHelp} error={errors.slug}>
              {creating ? <input {...input("slug", { autoComplete: "off" }, slugHelp)} /> : <p className={s.slugValue}>{draft.slug}</p>}
            </FieldRow>
            <FieldRow id="item-productionUnit" label="Baked as *" help="What you count in the kitchen: cookie, mini loaf, cake, batch." error={errors.productionUnit}>
              <input {...input("productionUnit", {}, "What you count in the kitchen: cookie, mini loaf, cake, batch.")} placeholder="cake" />
            </FieldRow>
            <FieldRow id="item-unitsPerProductionUnit" label="Per baked unit *" help={unitsHelp} error={errors.unitsPerProductionUnit}>
              <input {...input("unitsPerProductionUnit", { inputMode: "numeric" }, unitsHelp)} className={`input ${s.numInput}`} />
            </FieldRow>
          </div>
        </section>
      </fieldset>
      <div className={s.saveBar}>
        <button type="submit" className={`btn btn-primary ${s.btnSm}`} disabled={busy || (!creating && !dirty)}>{busy ? "Saving…" : creating ? "Create item" : "Save item"}</button>
        <span role="status" aria-live="polite" className={!status ? s.muted : status.kind === "error" ? s.statusError : s.statusOk}>
          {status?.text ?? (dirty && !creating ? "Unsaved changes" : "")}
        </span>
      </div>
    </form>
  );
}
