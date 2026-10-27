"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { saveDropAction } from "@/app/admin/(app)/drops/actions";
import type { DropState } from "@/lib/data";
import { editable, fromJstDay, MAX_DROP_BOXES, MIN_PRICE, toJstDay, toJstLocal } from "@/lib/drop-rules";
import { fmtDate } from "@/lib/format";
import { describedBy, FieldRow } from "./FieldRow";
import s from "@/app/admin/admin.module.css";

interface Choice { slug: string; name: string; price: number; defaultCap: number; defaultMaxPerCustomer: number; active: boolean }
interface Row { key: number; boxSlug: string; cap: string; price: string; maxPerCustomer: string; sold: number; held: number }
type Text = "number" | "nameEn" | "nameJa" | "descriptionEn" | "descriptionJa" | "openAt" | "closeAt" | "bakeAt" | "shipAt";
type Draft = Record<Text, string> & { boxes: Row[] };
interface Initial {
  nameEn: string; nameJa: string; descriptionEn: string; descriptionJa: string;
  openAt: Date; closeAt: Date; bakeAt: Date | null; shipAt: Date;
  boxes: { boxSlug: string; cap: number; price: number; maxPerCustomer: number; sold: number; held: number }[];
}

let rowKey = 0;
const fromInitial = (number: number, i: Initial | null, choices: Choice[]): Draft => ({
  number: String(number),
  nameEn: i?.nameEn ?? "",
  nameJa: i?.nameJa ?? "",
  descriptionEn: i?.descriptionEn ?? "",
  descriptionJa: i?.descriptionJa ?? "",
  openAt: i ? toJstLocal(i.openAt) : "",
  closeAt: i ? toJstLocal(i.closeAt) : "",
  bakeAt: i?.bakeAt ? toJstLocal(i.bakeAt) : "",
  shipAt: i ? toJstDay(i.shipAt) : "",
  // A new drop includes every active box at its defaults (D10).
  boxes: i
    ? i.boxes.map((b) => ({ key: ++rowKey, boxSlug: b.boxSlug, cap: String(b.cap), price: String(b.price), maxPerCustomer: String(b.maxPerCustomer), sold: b.sold, held: b.held }))
    : choices.filter((c) => c.active).map((c) => ({ key: ++rowKey, boxSlug: c.slug, cap: String(c.defaultCap), price: String(c.price), maxPerCustomer: String(c.defaultMaxPerCustomer), sold: 0, held: 0 })),
});
const payload = (d: Draft) => ({ ...d, boxes: d.boxes.map(({ boxSlug, cap, price, maxPerCustomer }) => ({ boxSlug, cap, price, maxPerCustomer })) });
const same = (a: Draft, b: Draft) => JSON.stringify(payload(a)) === JSON.stringify(payload(b));
const ORDER = ["number", "nameEn", "nameJa", "descriptionEn", "descriptionJa", "openAt", "closeAt", "bakeAt", "shipAt", "boxes"];
const fieldId = (key: string) => `drop-${key.replace(/\./g, "-")}`;
const firstBoxError = (errors: Record<string, string>) =>
  Object.keys(errors).filter((k) => /^boxes\.\d+\./.test(k)).sort((a, b) => Number(a.split(".")[1]) - Number(b.split(".")[1]))[0];

const STATE_NOTE: Record<DropState, string> = {
  draft: "Draft: not on the shop. Nothing here is visible to customers until the drop is scheduled.",
  scheduled: "Scheduled: the shop shows it as coming up. Everything can still change before it opens.",
  open: "Open and selling. Names, caps and per-customer limits can change; dates, boxes and prices are fixed (customers have seen them).",
  closed: "Closed. Names, caps and limits can change; dates, boxes and prices are fixed.",
  baking: "Baking. Names, caps and limits can change; dates, boxes and prices are fixed.",
  shipped: "Shipped. Only the names and descriptions can change.",
  complete: "Complete. Only the names and descriptions can change.",
  cancelled: "Cancelled. Only the names and descriptions can change.",
};

/**
 * Create or edit a drop (PRD 4.2). `slug` is null when creating: a new drop is a draft numbered after the last one.
 * What can change depends on the drop's state (drop-rules.ts `editable`); locked fields are shown, not offered.
 * Times are Japan time.
 */
export interface DropFormProps {
  slug: string | null; initial: Initial | null; number: number; state: DropState; choices: Choice[]; arrivalOffsetDays: number; notice?: string;
  /** The stored drop's updatedAt, as a number: when it changes (a lifecycle action, or this form's own save coming back), the form starts again from `initial`. */
  version?: number;
  /** Told whenever the form gains or loses unsaved changes (DropEditor holds the lifecycle buttons back while it has some). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Why the form can't be edited right now: a lifecycle action is under way (from its confirmation to the refresh that follows). */
  locked?: string;
}

export function DropForm({ slug, initial, number, state, choices, arrivalOffsetDays, notice, version, onDirtyChange, locked }: DropFormProps) {
  const router = useRouter();
  const creating = slug === null;
  const can = editable(state);
  const [saved, setSaved] = useState<Draft>(() => fromInitial(number, initial, choices));
  const [draft, setDraft] = useState<Draft>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(notice ? { kind: "saved", text: notice } : null);
  /** The drop moved to a state that locks different fields while this form was open: only a reload shows the truth. */
  const [stale, setStale] = useState(false);
  const dirty = !same(draft, saved);
  /**
   * The state the draft was drawn for. The save sends it, not the current `state`, so edits made under one state
   * are never relabelled as the next one's: if the drop moved on meanwhile, the server refuses (errors.state) instead
   * of quietly keeping the stored values for fields the new state locks.
   */
  const [draftState, setDraftState] = useState(state);
  // The stored drop changed under this form, or the clock moved its state (adjusted while rendering, so stale
  // values never paint): the saved baseline follows it, and so does the draft unless the owner is mid-edit.
  const key = `${version ?? "new"}:${state}`;
  const [seenKey, setSeenKey] = useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    const fresh = fromInitial(number, initial, choices);
    setSaved(fresh);
    if (!dirty) { setDraft(fresh); setDraftState(state); setErrors({}); setStale(false); }
  }
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (busy || !focusNext.current) return;
    document.getElementById(fieldId(focusNext.current))?.focus();
    focusNext.current = null;
  }, [busy, errors]);

  const touch = (key: string) => {
    setStatus(null);
    setStale(false);
    setErrors((errs) => Object.fromEntries(Object.entries(errs).filter(([k]) => k !== key && !k.startsWith(`${key}.`))));
  };
  const set = (key: Text, value: string) => { setDraft((d) => ({ ...d, [key]: value })); touch(key); };
  const setRow = (key: number, change: Partial<Row>) => { setDraft((d) => ({ ...d, boxes: d.boxes.map((r) => (r.key === key ? { ...r, ...change } : r)) })); touch("boxes"); };
  const choose = (key: number, boxSlug: string) => {
    const c = choices.find((x) => x.slug === boxSlug);
    setRow(key, c ? { boxSlug, cap: String(c.defaultCap), price: String(c.price), maxPerCustomer: String(c.defaultMaxPerCustomer) } : { boxSlug });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      // The state this form was drawn for goes along: the server refuses if the drop has since moved to a state that
      // locks different fields, rather than quietly keeping the stored values and letting this form call them saved.
      const r = await saveDropAction(payload(draft), slug, creating ? undefined : draftState);
      if (!r.ok) {
        setErrors(r.errors);
        setStale(!!r.errors.state);
        setStatus({ kind: "error", text: r.errors.state ?? r.errors.form ?? "Some fields need fixing; they're marked below." });
        const box = firstBoxError(r.errors);
        focusNext.current = ORDER.find((k) => r.errors[k]) ?? box ?? null;
        if (focusNext.current === "boxes") focusNext.current = can.boxes ? "boxes" : firstBoxError(r.errors) ?? null;
        return;
      }
      if (creating) {
        router.push(`/admin/drops/${r.slug}?created=1`);
        return;
      }
      setSaved(draft);
      setDraftState(state);
      setErrors({});
      setStatus({ kind: "saved", text: "Saved." });
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "Couldn't save. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const input = (key: Text, opts: { help?: string; disabled?: boolean; type?: string } = {}) => ({
    id: fieldId(key),
    className: "input",
    type: opts.type ?? "text",
    value: draft[key],
    disabled: opts.disabled,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": describedBy(fieldId(key), opts.help, errors[key]),
  });
  const pair = (en: Text, ja: Text, textarea = false) => (
    <div className={s.twoCol}>
      {([["English", en], ["日本語", ja]] as const).map(([lang, key]) => (
        <div key={key}>
          <label htmlFor={fieldId(key)} className={s.lang}>{lang}</label>
          {textarea ? <textarea {...input(key)} rows={3} /> : <input {...input(key)} />}
          {errors[key] && <p id={`${fieldId(key)}-err`} className={s.fieldError}>{errors[key]}</p>}
        </div>
      ))}
    </div>
  );
  const ship = fromJstDay(draft.shipAt);
  const arrives = ship ? new Date(ship.getTime() + arrivalOffsetDays * 86_400_000) : null;
  const chosen = new Set(draft.boxes.map((r) => r.boxSlug));
  const numberHelp = creating ? "Order numbers use it (AB-005-012), and the drop's link (drop-05). It can't change once created." : "Fixed: order numbers and links use it.";
  const datesLocked = !can.dates ? "Fixed once the drop has opened; the lifecycle actions (Close now, Reopen) move them." : undefined;

  return (
    <form onSubmit={submit} noValidate className={s.adminForm} aria-busy={busy}>
      <p className={s.banner}>{STATE_NOTE[state]}</p>
      <fieldset disabled={busy || !!locked} className={s.formFieldset}>
        <section aria-labelledby="drop-sec-name" className={`panel ${s.formSection}`}>
          <h2 id="drop-sec-name" className={s.sectionTitle}>Drop</h2>
          <div className={s.fields}>
            <FieldRow id={creating ? fieldId("number") : undefined} label="Number" help={numberHelp} error={errors.number}>
              {creating ? <input {...input("number", { help: numberHelp })} inputMode="numeric" className={`input ${s.numInput}`} /> : <p className={s.slugValue}>Drop {String(number).padStart(2, "0")}</p>}
            </FieldRow>
            <FieldRow label="Name *" help="Shown on the shop, e.g. “Drop 05 · December”.">{pair("nameEn", "nameJa")}</FieldRow>
            <FieldRow label="Description" help="Optional; a line under the name on the homepage.">{pair("descriptionEn", "descriptionJa", true)}</FieldRow>
          </div>
        </section>

        <section aria-labelledby="drop-sec-dates" className={`panel ${s.formSection}`}>
          <h2 id="drop-sec-dates" className={s.sectionTitle}>Dates (Japan time)</h2>
          {datesLocked && <p className={s.sectionIntro}>{datesLocked}</p>}
          <div className={s.dateGrid}>
            {([["openAt", "Opens *", "datetime-local"], ["closeAt", "Closes *", "datetime-local"], ["bakeAt", "Bake day (internal)", "datetime-local"], ["shipAt", "Ships *", "date"]] as const).map(([key, label, type]) => (
              <div key={key}>
                <label htmlFor={fieldId(key)} className="label">{label}</label>
                <input {...input(key, { type, disabled: !can.dates })} />
                {key === "shipAt" && arrives && <p className={s.help}>Arrives {fmtDate(arrives)} (ship date + {arrivalOffsetDays} day{arrivalOffsetDays === 1 ? "" : "s"}, Settings).</p>}
                {key === "bakeAt" && <p className={s.help}>For the production sheet; not shown to customers.</p>}
                {errors[key] && <p id={`${fieldId(key)}-err`} className={s.fieldError}>{errors[key]}</p>}
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="drop-sec-boxes" className={`panel ${s.formSection}`}>
          <h2 id="drop-sec-boxes" className={s.sectionTitle}>Boxes</h2>
          <p className={s.sectionIntro}>Prices and caps start from each box&apos;s defaults and belong to this drop from then on. A cap can never go below what&apos;s sold plus what checkouts are holding.</p>
          <div className={s.recipe} style={{ marginTop: 12 }}>
            <div className={s.dropBoxRow} aria-hidden>
              <span className={s.dropBoxHead}>Box</span><span className={s.dropBoxHead}>Cap</span><span className={s.dropBoxHead}>Price ¥</span><span className={s.dropBoxHead}>Each</span><span />
            </div>
            {draft.boxes.map((r, i) => {
              const k = (f: string) => `boxes.${i}.${f}`;
              const err = (f: string) => errors[k(f)];
              const control = (f: "cap" | "price" | "maxPerCustomer", label: string, disabled: boolean) => (
                <input
                  id={fieldId(k(f))}
                  aria-label={`${label} for box ${i + 1}`}
                  className="input"
                  inputMode="numeric"
                  value={r[f]}
                  disabled={disabled}
                  aria-invalid={err(f) ? true : undefined}
                  aria-describedby={err(f) ? `${fieldId(k(f))}-err` : undefined}
                  onChange={(e) => setRow(r.key, { [f]: e.target.value })}
                />
              );
              const existing = r.sold > 0 || r.held > 0;
              return (
                <div key={r.key}>
                  <div className={s.dropBoxRow}>
                    <select id={fieldId(k("box"))} aria-label={`Box ${i + 1}`} className="input" value={r.boxSlug} disabled={!can.boxes} aria-invalid={err("box") ? true : undefined} aria-describedby={err("box") ? `${fieldId(k("box"))}-err` : undefined} onChange={(e) => choose(r.key, e.target.value)}>
                      <option value="">Choose a box…</option>
                      {choices.map((c) => (
                        <option key={c.slug} value={c.slug} disabled={c.slug !== r.boxSlug && chosen.has(c.slug)}>{c.name}{c.active ? "" : " (hidden)"}</option>
                      ))}
                    </select>
                    {control("cap", "Cap", !can.caps)}
                    {control("price", `Price (min ¥${MIN_PRICE})`, !can.prices)}
                    {control("maxPerCustomer", "Per customer", !can.caps)}
                    <button type="button" className={s.linkBtn} disabled={!can.boxes || r.sold > 0} onClick={() => { setDraft((d) => ({ ...d, boxes: d.boxes.filter((x) => x.key !== r.key) })); touch("boxes"); }}>Remove</button>
                  </div>
                  {existing && <p className={s.help}>{r.sold} sold{r.held ? `, ${r.held} in checkouts right now` : ""}.</p>}
                  {(["box", "cap", "price", "maxPerCustomer"] as const).map((f) => err(f) && <p key={f} id={`${fieldId(k(f))}-err`} className={s.fieldError}>{err(f)}</p>)}
                </div>
              );
            })}
            {can.boxes && draft.boxes.length < MAX_DROP_BOXES && (
              <button type="button" id={fieldId("boxes")} className={s.linkBtn} style={{ alignSelf: "flex-start" }} aria-describedby={errors.boxes ? `${fieldId("boxes")}-err` : undefined}
                onClick={() => { setDraft((d) => ({ ...d, boxes: [...d.boxes, { key: ++rowKey, boxSlug: "", cap: "", price: "", maxPerCustomer: "5", sold: 0, held: 0 }] })); touch("boxes"); }}>
                + Add a box
              </button>
            )}
            {errors.boxes && <p id={`${fieldId("boxes")}-err`} className={s.fieldError}>{errors.boxes}</p>}
          </div>
        </section>
      </fieldset>
      <div className={s.saveBar}>
        <button type="submit" className={`btn btn-primary ${s.btnSm}`} disabled={busy || !!locked || (!creating && !dirty)}>{busy ? "Saving…" : creating ? "Create draft" : "Save drop"}</button>
        <span role="status" aria-live="polite" className={!status ? s.muted : status.kind === "error" ? s.statusError : s.statusOk}>
          {locked ?? status?.text ?? (dirty && !creating ? "Unsaved changes" : "")}
        </span>
        {stale && <button type="button" className={s.linkBtn} onClick={() => window.location.reload()}>Reload</button>}
        {dirty && !creating && !busy && !locked && <button type="button" className={s.linkBtn} onClick={() => { setDraft(saved); setDraftState(state); setErrors({}); setStatus(null); setStale(false); }}>Discard changes</button>}
      </div>
    </form>
  );
}
