import { describe, expect, it } from "vitest";
import { effectiveState, type DropState, type DropTimeline } from "./data";
import { ACTIONS, actionsFor, DROP_ACTIONS, transition, type DropAction, type OtherDrop } from "./drop-transitions";

const JST = (iso: string) => new Date(iso + "+09:00");
const NOW = JST("2026-11-10T12:00:00");
const DAY = 86_400_000;
type D = DropTimeline & { number: number };
/** Drop 05 as stored, with the dates around NOW chosen per case. */
const drop = (state: DropState, over: Partial<D> = {}): D => ({
  number: 5, state, openAt: JST("2026-11-08T10:00:00"), closeAt: JST("2026-11-15T21:00:00"), shipAt: JST("2026-11-22T00:00:00"), arriveAt: JST("2026-11-23T00:00:00"), ...over,
});
const run = (d: D, action: DropAction, over: Partial<{ now: Date; others: OtherDrop[]; closeAt: Date | null }> = {}) => transition(d, action, { now: NOW, others: [], ...over });
const ok = (r: ReturnType<typeof transition>) => (r.ok ? r.patch : expect.fail(r.error));
const err = (r: ReturnType<typeof transition>) => (r.ok ? expect.fail("expected a refusal") : r.error);

describe("actionsFor", () => {
  it("offers each state its moves (PRD 5.2a), by the effective state", () => {
    expect(actionsFor("draft", "draft")).toEqual(["schedule", "open"]);
    expect(actionsFor("scheduled", "scheduled")).toEqual(["unschedule", "open"]);
    expect(actionsFor("open", "open")).toEqual(["close"]);
    expect(actionsFor("closed", "closed")).toEqual(["reopen", "baking"]);
    expect(actionsFor("baking", "baking")).toEqual(["shipped"]);
    expect(actionsFor("shipped", "shipped")).toEqual(["complete"]);
    expect(actionsFor("cancelled", "cancelled")).toEqual([]);
  });
  it("keeps Mark complete on a drop the clock has moved to complete, until it is stored that way", () => {
    expect(actionsFor("complete", "shipped")).toEqual(["complete"]);
    expect(actionsFor("complete", "complete")).toEqual([]);
  });
});

describe("transition", () => {
  it("every accepted patch reads back as the action's target state under the same clock", () => {
    const cases: [D, DropAction, Partial<{ closeAt: Date }>][] = [
      [drop("draft", { openAt: JST("2026-11-12T10:00:00") }), "schedule", {}],
      [drop("scheduled", { openAt: JST("2026-11-12T10:00:00") }), "unschedule", {}],
      [drop("draft", { openAt: JST("2026-11-12T10:00:00") }), "open", {}],
      [drop("scheduled", { openAt: JST("2026-11-12T10:00:00") }), "open", {}],
      [drop("open"), "close", {}],
      [drop("closed", { closeAt: JST("2026-11-09T21:00:00") }), "reopen", { closeAt: JST("2026-11-13T21:00:00") }],
      [drop("closed", { closeAt: JST("2026-11-09T21:00:00") }), "baking", {}],
      [drop("baking", { closeAt: JST("2026-11-09T21:00:00") }), "shipped", {}],
      [drop("shipped", { closeAt: JST("2026-11-01T21:00:00"), shipAt: JST("2026-11-05T00:00:00"), arriveAt: JST("2026-11-06T00:00:00") }), "complete", {}],
    ];
    for (const [d, action, extra] of cases) {
      const patch = ok(run(d, action, extra));
      expect(patch.state, action).toBe(ACTIONS[action].to);
      expect(effectiveState({ ...d, ...patch }, NOW), `${action} reads back`).toBe(ACTIONS[action].to);
    }
  });

  it("refuses an action the drop's effective state doesn't offer, naming both states when they differ", () => {
    expect(err(run(drop("open"), "schedule"))).toBe("Schedule isn't available: the drop is open.");
    // Stored "scheduled" but the clock has opened it.
    expect(err(run(drop("scheduled"), "unschedule"))).toBe("Back to draft isn't available: the drop is open (stored as scheduled).");
    expect(err(run(drop("complete"), "complete"))).toMatch(/isn't available/);
  });

  describe("schedule", () => {
    it("needs an opening time in the future, and says how to open now", () => {
      expect(err(run(drop("draft"), "schedule"))).toBe("A scheduled drop has to open in the future. To open it now, use Open now.");
    });
    it("won't overlap another scheduled or open drop's window", () => {
      const d = drop("draft", { openAt: JST("2026-11-12T10:00:00") });
      const other = { number: 4, openAt: JST("2026-11-14T10:00:00"), closeAt: JST("2026-11-20T21:00:00") };
      expect(err(run(d, "schedule", { others: [{ ...other, state: "scheduled" }] }))).toBe("Drop 04 is scheduled over those dates. Only one drop can be open at a time; change the dates first.");
      // A drop selling right now: closing it would free the window, so that is the advice.
      expect(err(run(d, "schedule", { others: [{ ...other, state: "open", openAt: JST("2026-11-09T10:00:00") }] }))).toBe("Drop 04 is open now. Close it first; only one drop can be open at a time.");
      // Back to back is fine, and so is a drop that is already past.
      expect(run(d, "schedule", { others: [{ ...other, state: "scheduled", openAt: JST("2026-11-15T21:00:00") }] }).ok).toBe(true);
      expect(run(d, "schedule", { others: [{ ...other, state: "closed", openAt: JST("2026-11-01T10:00:00"), closeAt: JST("2026-11-14T21:00:00") }] }).ok).toBe(true);
    });
  });

  describe("open now", () => {
    it("sets the opening time to now, from a draft or a scheduled drop", () => {
      expect(ok(run(drop("draft", { openAt: JST("2026-12-01T10:00:00") }), "open"))).toEqual({ state: "open", openAt: NOW });
      expect(ok(run(drop("scheduled", { openAt: JST("2026-12-01T10:00:00") }), "open"))).toEqual({ state: "open", openAt: NOW });
    });
    it("needs a closing time still ahead, and no other open drop", () => {
      expect(err(run(drop("draft", { openAt: JST("2026-11-01T10:00:00"), closeAt: JST("2026-11-05T21:00:00"), shipAt: JST("2026-11-30T00:00:00"), arriveAt: JST("2026-12-01T00:00:00") }), "open"))).toBe("Set a closing time in the future first.");
      expect(err(run(drop("draft", { openAt: JST("2026-12-01T10:00:00") }), "open", { others: [{ number: 4, state: "open", openAt: JST("2026-11-08T10:00:00"), closeAt: JST("2026-11-12T21:00:00") }] }))).toBe("Drop 04 is open now. Close it first; only one drop can be open at a time.");
    });
    it("looks ahead: the window from now to the closing time can't run into a scheduled drop", () => {
      // Drop 05 would stay open until Nov 15; Drop 04 is scheduled to open on Nov 12, which the clock would do by itself.
      const soon = { number: 4, state: "scheduled" as const, openAt: JST("2026-11-12T10:00:00"), closeAt: JST("2026-11-20T21:00:00") };
      expect(err(run(drop("draft", { openAt: JST("2026-12-01T10:00:00") }), "open", { others: [soon] }))).toBe("Drop 04 is scheduled over those dates. Only one drop can be open at a time; change the dates first.");
      // A drop scheduled to open exactly when this one closes is fine.
      expect(run(drop("draft", { openAt: JST("2026-12-01T10:00:00") }), "open", { others: [{ ...soon, openAt: JST("2026-11-15T21:00:00") }] }).ok).toBe(true);
    });
  });

  it("close now sets the closing time to now", () => {
    expect(ok(run(drop("open"), "close"))).toEqual({ state: "closed", closeAt: NOW });
  });

  describe("reopen", () => {
    const closed = drop("closed", { closeAt: JST("2026-11-09T21:00:00") });
    it("needs a new closing time after now and before the ship date, and no other open drop", () => {
      expect(err(run(closed, "reopen"))).toBe("Pick a new closing time.");
      expect(err(run(closed, "reopen", { closeAt: JST("2026-11-10T11:00:00") }))).toBe("The new closing time has to be in the future.");
      expect(err(run(closed, "reopen", { closeAt: JST("2026-11-22T00:00:00") }))).toBe("The new closing time has to be before the ship date.");
      expect(err(run(closed, "reopen", { closeAt: JST("2026-11-13T21:00:00"), others: [{ number: 6, state: "open", openAt: NOW, closeAt: new Date(NOW.getTime() + DAY) }] }))).toMatch(/^Drop 06 is open now/);
    });
    it("reopens until that time, unless a scheduled drop would open before then", () => {
      expect(ok(run(closed, "reopen", { closeAt: JST("2026-11-13T21:00:00") }))).toEqual({ state: "open", closeAt: JST("2026-11-13T21:00:00") });
      const soon = { number: 4, state: "scheduled" as const, openAt: JST("2026-11-12T10:00:00"), closeAt: JST("2026-11-20T21:00:00") };
      expect(err(run(closed, "reopen", { closeAt: JST("2026-11-13T21:00:00"), others: [soon] }))).toMatch(/^Drop 04 is scheduled over those dates/);
      expect(run(closed, "reopen", { closeAt: JST("2026-11-12T10:00:00"), others: [soon] }).ok).toBe(true); // back to back
    });
    it("isn't offered once the drop has shipped by the clock", () => {
      expect(err(run(drop("closed", { closeAt: JST("2026-11-01T21:00:00"), shipAt: JST("2026-11-09T00:00:00"), arriveAt: JST("2026-11-10T00:00:00") }), "reopen", { closeAt: NOW }))).toMatch(/the drop is shipped \(stored as closed\)/);
    });
  });

  it("every action is listed with a label, an effect and the states it comes from", () => {
    for (const a of DROP_ACTIONS) {
      expect(ACTIONS[a].label.length).toBeGreaterThan(0);
      expect(ACTIONS[a].effect.length).toBeGreaterThan(10);
      expect(ACTIONS[a].from.length).toBeGreaterThan(0);
    }
    expect(DROP_ACTIONS.filter((a) => ACTIONS[a].confirm)).toEqual(["open", "close", "reopen"]);
  });
});
