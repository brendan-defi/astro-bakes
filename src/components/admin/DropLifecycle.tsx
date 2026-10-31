"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cancelDropAction, resendDropEmailsAction, transitionDropAction } from "@/app/admin/(app)/drops/actions";
import type { DropState } from "@/lib/data";
import { ACTIONS, actionsFor, type DropAction } from "@/lib/drop-transitions";
import s from "@/app/admin/admin.module.css";

/**
 * The lifecycle buttons for a drop (PRD 4.2, 5.2a): the moves its state allows now, each explained. The ones
 * customers see at once (open, close, reopen, cancel) ask twice; Reopen also takes the new closing time, Japan time.
 * `reopenDefault` is a datetime-local value the page works out (tomorrow evening, before the ship date). Cancel drop
 * says what it will cancel and refund (`cancelImpact`), and has to be typed out, since it can't be undone. A cancelled
 * drop whose cancellation emails didn't all go out offers to send the rest (`emailsOwed`).
 */
export interface DropLifecycleProps {
  slug: string; number: number; state: DropState; storedState: DropState; reopenDefault: string;
  /** The orders Cancel drop would cancel and what it would refund; the server refuses unless `version` still matches. */
  cancelImpact?: { orders: number; refund: number; version: string };
  /** Customers of this cancelled drop still owed their cancellation email. */
  emailsOwed?: number;
  /** Its shipped orders not yet delivered; on a completed drop, Mark complete is offered again for them. */
  undelivered?: number;
  /** Why the buttons are held back right now (the form beside them has unsaved changes). */
  blocked?: string;
  /** Told while an action is under way, from its confirmation opening to the request settling (DropEditor locks the form meanwhile). */
  onActiveChange?: (active: boolean) => void;
}

const CONFIRM_WORD = "cancel";
const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

export function DropLifecycle({ slug, number, state, storedState, reopenDefault, cancelImpact = { orders: 0, refund: 0, version: "" }, emailsOwed = 0, undelivered = 0, blocked, onActiveChange }: DropLifecycleProps) {
  const router = useRouter();
  const actions = actionsFor(state, storedState, undelivered);
  // A completed drop offers Mark complete again only for orders shipped after it was marked: say so.
  const late = storedState === "complete" && undelivered > 0 ? `${undelivered === 1 ? "One order" : `${undelivered} orders`} shipped after the drop was marked complete; once ${undelivered === 1 ? "it has" : "they have"} arrived, Mark complete shows ${undelivered === 1 ? "it" : "them"} as delivered too.` : "";
  const [pending, setPending] = useState<DropAction | null>(null);
  const [closeAt, setCloseAt] = useState(reopenDefault);
  const [typed, setTyped] = useState("");
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
    setTyped("");
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
      if (action === "cancel") {
        const r = await cancelDropAction(slug, cancelImpact.version);
        if (!r.ok) {
          setError(r.error);
          // The confirmation stays open and redraws with the orders as they are now.
          if (r.stale) router.refresh();
          return;
        }
        setPending(null);
        setDone(cancelledMessage(name, r));
        router.refresh();
        return;
      }
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

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await resendDropEmailsAction(slug);
      if (!r.ok) { setError(r.error); return; }
      setDone(`${plural(r.emailed, "cancellation email")} sent${r.emailFailed ? `; ${plural(r.emailFailed, "email")} still didn't go out (each order's timeline has the error).` : "."}`);
      router.refresh();
    } catch {
      setError("Couldn't do that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (actions.length === 0 && !done && !error && !emailsOwed) return <p className={s.help}>Nothing to do: the drop is {state}.</p>;
  return (
    <div className={s.lifecycle}>
      {pending ? (
        <div className={s.confirmBox} role="group" aria-labelledby="lifecycle-q">
          <p id="lifecycle-q" className={s.confirmText}>
            <strong>{ACTIONS[pending].label}: {name}?</strong> {ACTIONS[pending].effect}
            {pending === "cancel" && <> {impactText(cancelImpact)}</>}
          </p>
          {pending === "cancel" && (
            <label className={s.confirmField}>
              <span className="label">Type “{CONFIRM_WORD}” to confirm</span>
              <input className="input" autoComplete="off" value={typed} onChange={(e) => { setTyped(e.target.value); setError(null); }} />
            </label>
          )}
          {pending === "reopen" && (
            <label className={s.confirmField}>
              <span className="label">Closes (Japan time)</span>
              <input type="datetime-local" className="input" value={closeAt} onChange={(e) => { setCloseAt(e.target.value); setError(null); }} />
            </label>
          )}
          <div className={s.confirmActions}>
            <button type="button" className={`btn btn-primary ${s.btnSm}`} disabled={busy || !!blocked || (pending === "cancel" && typed.trim().toLowerCase() !== CONFIRM_WORD)} onClick={() => void run(pending)}>{busy ? (pending === "cancel" && cancelImpact.orders ? "Cancelling and emailing…" : "Working…") : `Yes, ${ACTIONS[pending].label.toLowerCase()}`}</button>
            <button type="button" className={s.linkBtn} disabled={busy} onClick={() => { setPending(null); setError(null); }}>{pending === "cancel" ? "Keep the drop" : "Cancel"}</button>
          </div>
          {blocked && <p role="alert" className={s.statusError}>{blocked}</p>}
        </div>
      ) : (
        <div className={s.lifecycleRow}>
          {actions.map((a) => (
            <button key={a} type="button" className={`btn btn-secondary ${s.btnSm}`} disabled={busy || !!blocked} title={ACTIONS[a].effect} onClick={() => start(a)}>{ACTIONS[a].label}</button>
          ))}
          {actions.length > 0 && <span className={s.help}>{blocked ?? (late || actions.map((a) => `${ACTIONS[a].label}: ${ACTIONS[a].effect}`).join(" "))}</span>}
        </div>
      )}
      {emailsOwed > 0 && !pending && (
        <div className={s.lifecycleRow}>
          <button type="button" className={`btn btn-secondary ${s.btnSm}`} disabled={busy} onClick={() => void resend()}>{busy ? "Sending…" : "Send them now"}</button>
          <span className={s.help}>{plural(emailsOwed, "customer")} {emailsOwed === 1 ? "hasn't" : "haven't"} had their cancellation email yet: a send failed, or it was interrupted.</span>
        </div>
      )}
      {error && <p role="alert" className={s.statusError}>{error}</p>}
      {done && !error && <p role="status" className={s.statusOk}>{done}</p>}
    </div>
  );
}

/** What Cancel drop will do to the drop's orders, for its confirmation. */
function impactText({ orders, refund }: { orders: number; refund: number }): string {
  if (!orders) return "It has no orders.";
  const n = `${orders} order${orders === 1 ? "" : "s"}`;
  const money = refund ? `${n} and ${yen(refund)} of refunds, recorded as owed (Stripe isn't connected yet, so no money moves)` : `${n}, none of them paid`;
  return `That's ${money}. Each customer is emailed, which can take a minute.`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function cancelledMessage(name: string, r: { cancelled: number; refund: number; emailed: number; emailFailed: number }): string {
  if (!r.cancelled) return `${name} is cancelled. It had no orders.`;
  const refund = r.refund ? `, ${yen(r.refund)} of refunds recorded as owed` : "";
  const mail = r.emailFailed ? `${plural(r.emailed, "customer")} emailed; ${plural(r.emailFailed, "email")} didn't go out (send them again below).` : "every customer emailed.";
  return `${name} is cancelled: ${plural(r.cancelled, "order")} cancelled${refund}, ${mail}`;
}
