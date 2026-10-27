"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { transitionDropAction } from "@/app/admin/(app)/drops/actions";
import type { DropState } from "@/lib/data";
import { ACTIONS, actionsFor, type DropAction } from "@/lib/drop-transitions";
import s from "@/app/admin/admin.module.css";

/**
 * The lifecycle buttons for a drop (PRD 4.2, 5.2a): the moves its state allows now, each explained. The ones
 * customers see at once (open, close, reopen) ask twice; Reopen also takes the new closing time, Japan time.
 * `reopenDefault` is a datetime-local value the page works out (tomorrow evening, before the ship date).
 */
export interface DropLifecycleProps {
  slug: string; number: number; state: DropState; storedState: DropState; reopenDefault: string;
  /** Why the buttons are held back right now (the form beside them has unsaved changes). */
  blocked?: string;
}

export function DropLifecycle({ slug, number, state, storedState, reopenDefault, blocked }: DropLifecycleProps) {
  const router = useRouter();
  const actions = actionsFor(state, storedState);
  const [pending, setPending] = useState<DropAction | null>(null);
  const [closeAt, setCloseAt] = useState(reopenDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const name = `Drop ${String(number).padStart(2, "0")}`;

  const start = (action: DropAction) => {
    if (blocked) return;
    setError(null);
    setDone(null);
    if (ACTIONS[action].confirm) setPending(action);
    else void run(action);
  };
  async function run(action: DropAction) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await transitionDropAction(slug, action, action === "reopen" ? { closeAt } : {});
      if (!r.ok) { setError(r.error); return; }
      setPending(null);
      setDone(`${ACTIONS[action].label}: done. ${name} is ${r.state}.`);
      router.refresh();
    } catch {
      setError("Couldn't do that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (actions.length === 0 && !done) return <p className={s.help}>Nothing to do: the drop is {state}.</p>;
  return (
    <div className={s.lifecycle}>
      {pending ? (
        <div className={s.confirmBox} role="group" aria-labelledby="lifecycle-q">
          <p id="lifecycle-q" className={s.confirmText}>
            <strong>{ACTIONS[pending].label}: {name}?</strong> {ACTIONS[pending].effect}
          </p>
          {pending === "reopen" && (
            <label className={s.confirmField}>
              <span className="label">Closes (Japan time)</span>
              <input type="datetime-local" className="input" value={closeAt} onChange={(e) => { setCloseAt(e.target.value); setError(null); }} />
            </label>
          )}
          <div className={s.confirmActions}>
            <button type="button" className={`btn btn-primary ${s.btnSm}`} disabled={busy} onClick={() => void run(pending)}>{busy ? "Working…" : `Yes, ${ACTIONS[pending].label.toLowerCase()}`}</button>
            <button type="button" className={s.linkBtn} disabled={busy} onClick={() => { setPending(null); setError(null); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className={s.lifecycleRow}>
          {actions.map((a) => (
            <button key={a} type="button" className={`btn btn-secondary ${s.btnSm}`} disabled={busy || !!blocked} title={ACTIONS[a].effect} onClick={() => start(a)}>{ACTIONS[a].label}</button>
          ))}
          {actions.length > 0 && <span className={s.help}>{blocked ?? actions.map((a) => `${ACTIONS[a].label}: ${ACTIONS[a].effect}`).join(" ")}</span>}
        </div>
      )}
      {error && <p role="alert" className={s.statusError}>{error}</p>}
      {done && !error && <p role="status" className={s.statusOk}>{done}</p>}
    </div>
  );
}
