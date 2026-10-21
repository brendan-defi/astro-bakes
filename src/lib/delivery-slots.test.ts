import { describe, expect, it } from "vitest";
import { DELIVERY_SLOTS, isDeliverySlot, japanPostSlotCode } from "./delivery-slots";

describe("delivery slots (D21)", () => {
  it("lists Japan Post's ゆうパック slots in display order, starting with no preference", () => {
    expect(DELIVERY_SLOTS).toEqual(["none", "morning", "12_14", "14_16", "16_18", "18_20", "19_21"]);
  });

  it("maps every slot to a distinct label-tool code, with no 56 (the withdrawn 20–21 slot)", () => {
    const codes = DELIVERY_SLOTS.map(japanPostSlotCode);
    expect(codes).toEqual(["00", "51", "52", "53", "54", "55", "57"]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("accepts only the known slots", () => {
    for (const s of DELIVERY_SLOTS) expect(isDeliverySlot(s)).toBe(true);
    for (const bad of ["20_21", "", "NONE", null, undefined, 51]) expect(isDeliverySlot(bad)).toBe(false);
  });
});
