"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { addOrderNoteAction } from "@/app/admin/(app)/orders/actions";
import { NOTE_MAX } from "@/lib/order-admin-rules";
import s from "@/app/admin/admin.module.css";

/** Add an internal note to an order's timeline (PRD 4.4). Customers never see these. */
export function OrderNoteForm({ number }: { number: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await addOrderNoteAction(number, body);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("Couldn't save the note. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={s.noteForm} noValidate>
      <label htmlFor="order-note" className="label">Add a note</label>
      <textarea
        id="order-note"
        className="input"
        rows={3}
        value={body}
        maxLength={NOTE_MAX + 100}
        disabled={busy}
        onChange={(e) => { setBody(e.target.value); setError(null); }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "order-note-err" : "order-note-help"}
      />
      {error ? <p id="order-note-err" className={s.fieldError} role="alert">{error}</p> : <p id="order-note-help" className={s.help}>Internal only: the customer never sees notes.</p>}
      <button type="submit" className={`btn btn-secondary ${s.btnSm}`} disabled={busy || !body.trim()}>{busy ? "Saving…" : "Add note"}</button>
    </form>
  );
}
