"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  /** Told while an action is under way, from its confirmation opening to the request settling (DropEditor locks the form meanwhile). */
  onActiveChange?: (active: boolean) => void;
}

export function DropLifecycle({ slug, number, state, storedState, reopenDefault, blocked, onActiveChange }: DropLifecycleProps) {
  const router = useRouter();
  const actions = actionsFor(state, storedState);
  const [pending, setPending] = useState<DropAction | null>(null);
  const [closeAt, setCloseAt] = useState(reopenDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const name = `Drop ${String(number).padStart(2, "0")}`;
  const active = pending !== null || busy;
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);

  const start = (action: DropAction) => {
    if (blocked) return;
    setError(null);
    setDone(null);
    if (ACTIONS[action].confirm) setPending(action);
    else void run(action);
  };
  async function run(action: DropAction) {
    if (busy) return;
    // Checked again here, not only at the first button: the form is locked while a confirmation is open, but a
    // change that got in anyway must not be thrown away by the refresh this action ends with.
    if (blocked) { setPending(null); setError(blocked); return; }
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
            <button type="button" className={`btn btn-primary ${s.btnSm}`} disabled={busy || !!blocked} onClick={() => void run(pending)}>{busy ? "Working…" : `Yes, ${ACTIONS[pending].label.toLowerCase()}`}</button>
            <button type="button" className={s.linkBtn} disabled={busy} onClick={() => { setPending(null); setError(null); }}>Cancel</button>
          </div>
          {blocked && <p role="alert" className={s.statusError}>{blocked}</p>}
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
