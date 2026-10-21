import type { ReactNode } from "react";
import s from "@/app/admin/admin.module.css";

/** Ids an input should point aria-describedby at: its help and its error, when shown. */
export const describedBy = (id: string, help?: ReactNode, error?: string) => [help && `${id}-help`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;

/** One labelled row of an admin form: label on the left; the control, its help and its error on the right. */
export function FieldRow({ id, label, help, error, children }: { id?: string; label: ReactNode; help?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className={s.fieldRow}>
      {id ? <label htmlFor={id} className="label">{label}</label> : <span className="label">{label}</span>}
      <div>
        {children}
        {help && <p id={id ? `${id}-help` : undefined} className={s.help}>{help}</p>}
        {error && <p id={id ? `${id}-err` : undefined} className={s.fieldError}>{error}</p>}
      </div>
    </div>
  );
}
