import { describe, expect, it } from "vitest";
import { boxes, effectiveState, getHome, mockSource, settings, type Drop } from "./data";

const JST = (iso: string) => new Date(iso + "+09:00");
const [drop03, drop04] = mockSource.drops;
const draft: Drop = {
  ...drop04,
  id: "drop-05",
  number: 5,
  name: "Drop 05 · Draft",
  state: "draft",
  openAt: JST("2026-12-06T10:00:00"),
  closeAt: JST("2026-12-13T21:00:00"),
  shipAt: JST("2026-12-20T00:00:00"),
  arriveAt: JST("2026-12-21T00:00:00"),
};
const cancelled: Drop = { ...draft, id: "drop-06", number: 6, name: "Drop 06 · Cancelled", state: "cancelled" };
const OVERRIDES = ["open", "scheduled", "closed", "nodrop"];

describe("effectiveState", () => {
  it("walks a scheduled drop through the system transitions by the clock (PRD 5.2a)", () => {
    expect(effectiveState(drop04, JST("2026-11-01T00:00:00"))).toBe("scheduled");
    expect(effectiveState(drop04, JST("2026-11-08T10:00:00"))).toBe("open");
    expect(effectiveState(drop04, JST("2026-11-15T21:00:00"))).toBe("closed");
    expect(effectiveState(drop04, JST("2026-11-22T00:00:00"))).toBe("shipped");
    expect(effectiveState(drop04, JST("2026-11-27T00:00:00"))).toBe("complete");
  });

  it("leaves admin-only states alone", () => {
    expect(effectiveState(draft, JST("2027-01-01T00:00:00"))).toBe("draft");
    expect(effectiveState(cancelled, JST("2027-01-01T00:00:00"))).toBe("cancelled");
    expect(effectiveState({ ...drop03, state: "baking" }, JST("2026-10-20T00:00:00"))).toBe("baking");
  });
});

describe("getHome", () => {
  it("follows the sample timeline", () => {
    expect(getHome({ now: JST("2026-10-15T12:00:00") }, mockSource)).toMatchObject({ state: "open", drop: { id: "drop-03" } });
    expect(getHome({ now: JST("2026-10-19T12:00:00") }, mockSource)).toMatchObject({ state: "closed", drop: { id: "drop-03" }, nextDrop: { id: "drop-04" } });
    expect(getHome({ now: JST("2026-10-30T12:00:00") }, mockSource)).toMatchObject({ state: "scheduled", drop: { id: "drop-04" }, nextDrop: null });
    expect(getHome({ now: JST("2026-11-10T12:00:00") }, mockSource)).toMatchObject({ state: "open", drop: { id: "drop-04" } });
    expect(getHome({ now: JST("2026-12-15T12:00:00") }, mockSource)).toMatchObject({ state: "nodrop", drop: null, nextDrop: null });
  });

  it("shows the catalogue when a closed drop has no successor", () => {
    const catalogue = [boxes[0]];
    const h = getHome({ now: JST("2026-10-19T12:00:00") }, { ...mockSource, drops: [drop03], catalogue });
    expect(h).toMatchObject({ state: "closed", nextDrop: null });
    expect(h.boxes).toBe(catalogue);
  });

  it("hides draft and cancelled drops from the default resolution", () => {
    const now = JST("2026-10-19T12:00:00");
    expect(getHome({ now }, { ...mockSource, drops: [draft, cancelled] }).state).toBe("nodrop");
    expect(getHome({ now }, { ...mockSource, drops: [drop03, draft, cancelled] })).toMatchObject({ state: "closed", drop: { id: "drop-03" }, nextDrop: null });
  });

  it("never surfaces a draft or cancelled drop through a demo override", () => {
    const now = JST("2026-10-19T12:00:00");
    for (const state of OVERRIDES) {
      const h = getHome({ state, now }, { ...mockSource, drops: [drop03, draft, cancelled] });
      expect([h.drop?.id, h.nextDrop?.id]).not.toContain("drop-05");
      expect([h.drop?.id, h.nextDrop?.id]).not.toContain("drop-06");
      expect(getHome({ state, now }, { ...mockSource, drops: [draft, cancelled] }).state).toBe("nodrop");
    }
  });

  it("demo overrides pick the matching real drops", () => {
    const now = JST("2026-10-19T12:00:00");
    expect(getHome({ state: "open", now }, mockSource)).toMatchObject({ state: "open", drop: { id: "drop-03" } });
    expect(getHome({ state: "scheduled", now }, mockSource)).toMatchObject({ state: "scheduled", drop: { id: "drop-04" } });
    expect(getHome({ state: "closed", now }, mockSource)).toMatchObject({ state: "closed", drop: { id: "drop-03" }, nextDrop: { id: "drop-04" } });
    expect(getHome({ state: "closed", next: "0", now }, mockSource)).toMatchObject({ nextDrop: null });
    expect(getHome({ state: "nodrop", now }, mockSource)).toMatchObject({ state: "nodrop", drop: null });
    expect(getHome({ state: "bogus", now }, mockSource).state).toBe("closed");
  });

  it("passes the source's settings and catalogue through", () => {
    const custom = { ...mockSource, settings: { ...settings, shippingFee: 1234 }, catalogue: [boxes[1]] };
    const h = getHome({ state: "nodrop" }, custom);
    expect(h.settings.shippingFee).toBe(1234);
    expect(h.boxes).toEqual([boxes[1]]);
  });

  it("resolves the viewer flags", () => {
    expect(getHome({}, mockSource).viewer).toMatchObject({ signedIn: false, order: null });
    expect(getHome({ viewer: "member" }, mockSource).viewer).toMatchObject({ signedIn: true, optedIn: true, order: null });
    expect(getHome({ viewer: "ordered" }, mockSource).viewer.order).toMatchObject({ dropId: "drop-03", boxCount: 2 });
  });
});

describe("getHome sold out (D9)", () => {
  const gone = (d: Drop): Drop => ({ ...d, boxes: d.boxes.map((b) => ({ ...b, left: 0 })) });
  it("flags an open drop whose every box has nothing left, and nothing else", () => {
    const now = JST("2026-11-10T12:00:00");
    expect(getHome({ now }, { ...mockSource, drops: [drop03, drop04] }).soldOut).toBe(false);
    expect(getHome({ now }, { ...mockSource, drops: [drop03, gone(drop04)] })).toMatchObject({ state: "open", drop: { id: "drop-04" }, soldOut: true });
    const oneLeft = { ...gone(drop04), boxes: gone(drop04).boxes.map((b, i) => (i === 0 ? { ...b, left: 1 } : b)) };
    expect(getHome({ now }, { ...mockSource, drops: [drop03, oneLeft] }).soldOut).toBe(false);
    expect(getHome({ now: JST("2026-10-30T12:00:00") }, { ...mockSource, drops: [drop03, gone(drop04)] })).toMatchObject({ state: "scheduled", soldOut: false });
    expect(getHome({ state: "open", now }, { ...mockSource, drops: [gone(drop04)] }).soldOut).toBe(true);
  });
});

describe("getHome with the next drop open while the last one is still in the kitchen", () => {
  it("shows the open drop, not the earlier closed one", () => {
    // Drop 03 closed on Oct 18 and ships Oct 25; the owner opens Drop 04 early, on Oct 20.
    const early = { ...drop04, state: "open" as const, openAt: JST("2026-10-20T10:00:00") };
    const now = JST("2026-10-21T12:00:00");
    expect(getHome({ now }, { ...mockSource, drops: [drop03, early] })).toMatchObject({ state: "open", drop: { id: "drop-04" }, soldOut: false });
    // Once Drop 04 closes too, the earliest unfinished drop is current again.
    expect(getHome({ now: JST("2026-10-23T12:00:00") }, { ...mockSource, drops: [drop03, { ...early, closeAt: JST("2026-10-22T21:00:00") }] })).toMatchObject({ state: "closed", drop: { id: "drop-03" } });
  });
});
