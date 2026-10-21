"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { saveSettingsAction } from "@/app/admin/(app)/settings/actions";
import { SETTING_FIELDS, SETTINGS_SECTIONS, type SettingField, type SettingValue } from "@/lib/settings-fields";
import s from "@/app/admin/admin.module.css";

type Draft = Record<string, string | boolean>;

/** Numbers are edited as text, so a half-typed value doesn't jump around; the server parses them. */
const toDraft = (values: Record<string, SettingValue>): Draft =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === "number" ? String(v) : v]));

const sameDraft = (a: Draft, b: Draft) => SETTING_FIELDS.every((f) => a[f.key] === b[f.key]);

/**
 * The settings page's form (PRD 4.9): every section saves together; the server re-validates each field. The fields
 * are locked while a save is in flight, so nothing typed meanwhile is overwritten by that save's answer.
 */
export function SettingsForm({ initial }: { initial: Record<string, SettingValue> }) {
  const [saved, setSaved] = useState<Draft>(() => toDraft(initial));
  const [draft, setDraft] = useState<Draft>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);
  const dirty = !sameDraft(draft, saved);
  // The first field a failed save turned down; focused once the fields are enabled again (a disabled one can't take focus).
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (busy || !focusNext.current) return;
    document.getElementById(`set-${focusNext.current}`)?.focus();
    focusNext.current = null;
  }, [busy, errors]);

  const set = (key: string, value: string | boolean) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus(null);
    if (errors[key]) setErrors(({ [key]: _gone, ...rest }) => rest);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await saveSettingsAction(draft);
      if (!r.ok) {
        setErrors(r.errors);
        setStatus({ kind: "error", text: "Some fields need fixing; they're marked below." });
        focusNext.current = SETTING_FIELDS.find((f) => r.errors[f.key])?.key ?? null;
        return;
      }
      const next = toDraft(r.values);
      setSaved(next);
      setDraft(next);
      setErrors({});
      setStatus({ kind: "saved", text: "Saved. The site shows the new values now." });
    } catch {
      setStatus({ kind: "error", text: "Couldn't save. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className={s.settingsForm} aria-busy={busy}>
      <fieldset disabled={busy} className={s.settingsFields}>
        {SETTINGS_SECTIONS.map((section) => (
          <section key={section.id} aria-labelledby={`sec-${section.id}`} className={`panel ${s.settingsSection}`}>
            <h2 id={`sec-${section.id}`} className={s.sectionTitle}>{section.title}</h2>
            {section.intro && <p className={s.sectionIntro}>{section.intro}</p>}
            <div className={s.fields}>
              {section.fields.map((f) => (
                <Field key={f.key} field={f} value={draft[f.key]} error={errors[f.key]} onChange={(v) => set(f.key, v)} />
              ))}
            </div>
          </section>
        ))}
      </fieldset>
      <div className={s.saveBar}>
        <button type="submit" className={`btn btn-primary ${s.btnSm}`} disabled={busy || !dirty}>{busy ? "Saving…" : "Save settings"}</button>
        <span role="status" aria-live="polite" className={!status ? s.muted : status.kind === "error" ? s.statusError : s.statusOk}>
          {status?.text ?? (dirty ? "Unsaved changes" : "")}
        </span>
      </div>
    </form>
  );
}

function Field({ field: f, value, error, onChange }: { field: SettingField; value: string | boolean | undefined; error?: string; onChange: (v: string | boolean) => void }) {
  const id = `set-${f.key}`;
  const described = [f.help && `${id}-help`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  const notes = (
    <>
      {f.help && <p id={`${id}-help`} className={s.help}>{f.help}</p>}
      {error && <p id={`${id}-err`} className={s.fieldError}>{error}</p>}
    </>
  );
  if (f.kind === "readonly") {
    return (
      <div className={s.fieldRow}>
        <span className="label">{f.label}</span>
        <div>
          <p id={id} className={s.fixedValue} aria-describedby={described}>{f.display(typeof value === "string" && /^\d+$/.test(value) ? Number(value) : (value ?? f.default))}</p>
          {notes}
        </div>
      </div>
    );
  }
  if (f.kind === "bool") {
    return (
      <div className={s.fieldRow}>
        <span />
        <div>
          <label className={s.checkRow}>
            <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} aria-describedby={described} />
            {f.label}
          </label>
          {notes}
        </div>
      </div>
    );
  }
  const common = {
    id,
    className: "input",
    value: typeof value === "string" ? value : "",
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": described,
  };
  const placeholder = "placeholder" in f ? f.placeholder : undefined;
  return (
    <div className={s.fieldRow}>
      <label htmlFor={id} className="label">{f.label}{"required" in f && f.required ? " *" : ""}</label>
      <div>
        {f.kind === "textarea" ? (
          <textarea {...common} rows={3} placeholder={placeholder} />
        ) : f.kind === "int" ? (
          <div className={s.withUnit}>
            {f.unit === "¥" && <span>¥</span>}
            <input {...common} inputMode="numeric" className={`input ${s.numInput}`} />
            {f.unit && f.unit !== "¥" && <span>{f.unit}</span>}
          </div>
        ) : (
          <input
            {...common}
            type={f.kind === "email" ? "email" : f.kind === "url" ? "url" : f.kind === "phone" ? "tel" : "text"}
            inputMode={f.kind === "postal" ? "numeric" : undefined}
            autoComplete="off"
            placeholder={placeholder}
          />
        )}
        {notes}
      </div>
    </div>
  );
}
