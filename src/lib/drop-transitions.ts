import { effectiveState, type DropState, type DropTimeline } from "./data";

/**
 * The drop lifecycle (PRD 4.2, 5.2a) as pure rules. The admin actions apply them inside a transaction
 * (drops-admin.ts) and the editor shows them as buttons (DropLifecycle). Every action is checked against the
 * drop's effective state (effectiveState: the stored state moved on by the clock), and the patch it produces
 * reads back as the target state under the same clock, so the shop and the admin never disagree.
 *
 * D9 (2026-10-23): a sold-out drop stays open until its closing time; there is no automatic early close.
 * Cancel drop also cancels and refunds every order, so it runs through cancelDrop rather than transitionDrop.
 */
export type DropAction = "schedule" | "unschedule" | "open" | "close" | "reopen" | "baking" | "shipped" | "complete" | "cancel";
export const DROP_ACTIONS = ["schedule", "unschedule", "open", "close", "reopen", "baking", "shipped", "complete", "cancel"] as const satisfies readonly DropAction[];
export const isDropAction = (s: unknown): s is DropAction => typeof s === "string" && (DROP_ACTIONS as readonly string[]).includes(s);

export interface ActionInfo {
  label: string;
  /** Effective states the action is offered from. */
  from: DropState[];
  to: DropState;
  /** What the owner is told it does. */
  effect: string;
  /** Customers see the result at once, so the button asks twice. */
  confirm: boolean;
}

export const ACTIONS: Record<DropAction, ActionInfo> = {
  schedule: { label: "Schedule", from: ["draft"], to: "scheduled", effect: "The shop shows it as coming up, and it opens by itself at its opening time.", confirm: false },
  unschedule: { label: "Back to draft", from: ["scheduled"], to: "draft", effect: "Takes it off the shop until it is scheduled again.", confirm: false },
  open: { label: "Open now", from: ["draft", "scheduled"], to: "open", effect: "Customers can order from this moment; the opening time becomes now.", confirm: true },
  close: { label: "Close now", from: ["open"], to: "closed", effect: "No new orders, and customers can no longer cancel; the closing time becomes now. Checkouts already in progress may finish.", confirm: true },
  reopen: { label: "Reopen", from: ["closed"], to: "open", effect: "Takes orders again, and lets customers cancel again, until the new closing time.", confirm: true },
  baking: { label: "Start baking", from: ["closed"], to: "baking", effect: "Customers see their orders as baking.", confirm: false },
  shipped: { label: "Mark shipped", from: ["baking"], to: "shipped", effect: "The whole drop has left the kitchen. Orders get their tracking one by one (fulfilment).", confirm: false },
  complete: { label: "Mark complete", from: ["shipped", "complete"], to: "complete", effect: "Every shipped order shows as delivered, and the drop leaves the homepage.", confirm: false },
  cancel: { label: "Cancel drop", from: ["draft", "scheduled", "open", "closed"], to: "cancelled", effect: "Takes it off the shop for good and cancels every order on it, refunding each in full. This can't be undone.", confirm: true },
};

/**
 * The actions a drop offers: by its effective state, except that a drop the clock has already moved to complete
 * (a few days after arrival) still offers Mark complete until it is stored that way, since that is what delivers
 * the orders.
 */
export function actionsFor(effective: DropState, stored: DropState): DropAction[] {
  return DROP_ACTIONS.filter((a) => ACTIONS[a].from.includes(effective) && !(a === "complete" && stored === "complete"));
}

/** Another drop's selling window, for the one-open-drop rule. `state` is its effective state. */
export interface OtherDrop { number: number; state: DropState; openAt: Date; closeAt: Date }
export interface TransitionInput { now: Date; others: OtherDrop[]; closeAt?: Date | null }
export interface Patch { state: DropState; openAt?: Date; closeAt?: Date }
export type TransitionResult = { ok: true; patch: Patch } | { ok: false; error: string };

const pad = (n: number) => String(n).padStart(2, "0");
const overlaps = (aOpen: Date, aClose: Date, bOpen: Date, bClose: Date) => aOpen < bClose && bOpen < aClose;

/**
 * One open drop at a time, now and later: the other scheduled or open drop whose selling window overlaps
 * [openAt, closeAt), if any. Every writer that gives a drop a public window checks the window it would end up
 * with (Schedule, Open now, Reopen in transition(); a scheduled drop's date edits in drops-admin.ts), under the
 * same lock, so the clock can never open two drops at once. Back to back is fine: a window may start exactly
 * when another closes.
 */
export function windowClash(openAt: Date, closeAt: Date, others: OtherDrop[]): OtherDrop | undefined {
  return others.find((o) => (o.state === "scheduled" || o.state === "open") && overlaps(openAt, closeAt, o.openAt, o.closeAt));
}

/** Why a window was refused: a drop selling right now has to be closed; one that would clash later needs other dates. */
export function clashMessage(o: OtherDrop, now: Date): string {
  if (o.state === "open" && o.openAt <= now) return `Drop ${pad(o.number)} is open now. Close it first; only one drop can be open at a time.`;
  return `Drop ${pad(o.number)} is ${o.state} over those dates. Only one drop can be open at a time; change the dates first.`;
}

export function transition(drop: DropTimeline & { number: number }, action: DropAction, input: TransitionInput): TransitionResult {
  const state = effectiveState(drop, input.now);
  const info = ACTIONS[action];
  if (!info.from.includes(state) || (action === "complete" && drop.state === "complete")) {
    return { ok: false, error: `${info.label} isn't available: the drop is ${state === drop.state ? state : `${state} (stored as ${drop.state})`}.` };
  }
  /** The window the drop would end up with has to be clear of every other scheduled or open drop's. */
  const clear = (openAt: Date, closeAt: Date): TransitionResult | null => {
    const clash = windowClash(openAt, closeAt, input.others);
    return clash ? { ok: false, error: clashMessage(clash, input.now) } : null;
  };
  switch (action) {
    case "schedule": {
      if (drop.openAt <= input.now) return { ok: false, error: "A scheduled drop has to open in the future. To open it now, use Open now." };
      return clear(drop.openAt, drop.closeAt) ?? { ok: true, patch: { state: "scheduled" } };
    }
    case "unschedule":
      return { ok: true, patch: { state: "draft" } };
    case "open": {
      if (drop.closeAt <= input.now) return { ok: false, error: "Set a closing time in the future first." };
      return clear(input.now, drop.closeAt) ?? { ok: true, patch: { state: "open", openAt: input.now } };
    }
    case "close":
      return { ok: true, patch: { state: "closed", closeAt: input.now } };
    case "reopen": {
      const closeAt = input.closeAt;
      if (!closeAt) return { ok: false, error: "Pick a new closing time." };
      if (closeAt <= input.now) return { ok: false, error: "The new closing time has to be in the future." };
      if (closeAt >= drop.shipAt) return { ok: false, error: "The new closing time has to be before the ship date." };
      return clear(input.now, closeAt) ?? { ok: true, patch: { state: "open", closeAt } };
    }
    case "baking":
      return { ok: true, patch: { state: "baking" } };
    case "shipped":
      return { ok: true, patch: { state: "shipped" } };
    case "complete":
      return { ok: true, patch: { state: "complete" } };
    case "cancel":
      return { ok: true, patch: { state: "cancelled" } };
  }
}
