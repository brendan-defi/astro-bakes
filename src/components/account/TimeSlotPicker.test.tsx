import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@/lib/i18n";
import type { DeliverySlot } from "@/lib/delivery-slots";
import { TimeSlotPicker } from "./TimeSlotPicker";

const changeTimeSlotAction = vi.fn();
const router = { refresh: vi.fn() };
vi.mock("@/app/[locale]/account/actions", () => ({ changeTimeSlotAction: (...a: unknown[]) => changeTimeSlotAction(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = getStrings("en");
const radios = () => screen.getAllByRole("radio") as HTMLInputElement[];
const checked = () => radios().find((r) => r.checked)?.value;
const pick = (slot: DeliverySlot) => fireEvent.click(screen.getByLabelText(t.deliverySlots[slot]));
/** A promise the test resolves by hand, to hold a save in flight. */
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
const ok = (slot: DeliverySlot) => ({ ok: true, slot, changed: true });
const view = (initial: DeliverySlot = "none") => <TimeSlotPicker locale="en" number="AB-003-017" initial={initial} legend="Arrives Mon, Oct 26. When suits you?" />;

describe("TimeSlotPicker", () => {
  // Block bodies on purpose: a returned mock would be run as a vitest cleanup after each test.
  beforeEach(() => { changeTimeSlotAction.mockReset(); router.refresh.mockReset(); });
  afterEach(cleanup);

  it("keeps the new slot when the server accepts it", async () => {
    changeTimeSlotAction.mockResolvedValue(ok("14_16"));
    render(view());
    await act(async () => { pick("14_16"); });
    expect(changeTimeSlotAction).toHaveBeenCalledWith("AB-003-017", "14_16");
    expect(checked()).toBe("14_16");
    expect(screen.getByRole("status").textContent).toBe(t.saved);
  });

  it("never disables the radios while saving, so keyboard focus stays in the group", async () => {
    const save = deferred<unknown>();
    changeTimeSlotAction.mockReturnValue(save.promise);
    render(view());
    radios()[1].focus();
    await act(async () => { pick("morning"); });
    expect(radios().every((r) => !r.disabled)).toBe(true);
    expect(screen.getByRole("group").getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(radios()[1]);
    await act(async () => { save.resolve(ok("morning")); });
    expect(screen.getByRole("group").getAttribute("aria-busy")).toBeNull();
    expect(document.activeElement).toBe(radios()[1]);
  });

  it("queues choices made during a save and sends only the latest one after it", async () => {
    const first = deferred<unknown>();
    changeTimeSlotAction.mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok("16_18"));
    render(view());
    await act(async () => { pick("morning"); });
    await act(async () => { pick("12_14"); pick("16_18"); });
    expect(changeTimeSlotAction).toHaveBeenCalledTimes(1);
    expect(checked()).toBe("16_18");
    await act(async () => { first.resolve(ok("morning")); });
    expect(changeTimeSlotAction.mock.calls.map((c) => c[1])).toEqual(["morning", "16_18"]);
    expect(checked()).toBe("16_18");
    expect(screen.getByRole("status").textContent).toBe(t.saved);
  });

  it("doesn't send anything for a choice that goes back to the saved slot mid-save", async () => {
    const first = deferred<unknown>();
    changeTimeSlotAction.mockReturnValueOnce(first.promise);
    render(view());
    await act(async () => { pick("morning"); });
    await act(async () => { pick("none"); });
    await act(async () => { first.resolve({ ok: false, error: "invalid" }); });
    expect(changeTimeSlotAction).toHaveBeenCalledTimes(1);
    expect(checked()).toBe("none");
  });

  it("on a failed later save, goes back to the last slot the server accepted", async () => {
    changeTimeSlotAction.mockResolvedValueOnce(ok("morning")).mockRejectedValueOnce(new Error("network"));
    render(view());
    await act(async () => { pick("morning"); });
    await act(async () => { pick("18_20"); });
    expect(checked()).toBe("morning");
    expect(screen.getByRole("alert").textContent).toBe(t.saveFailed);
  });

  it("puts the old slot back when the server declines", async () => {
    changeTimeSlotAction.mockResolvedValue({ ok: false, error: "invalid" });
    render(view());
    await act(async () => { pick("morning"); });
    expect(checked()).toBe("none");
    expect(screen.getByRole("alert").textContent).toBe(t.saveFailed);
  });

  it("explains a closed drop and refreshes so the page shows the slot as fixed", async () => {
    changeTimeSlotAction.mockResolvedValue({ ok: false, error: "closed" });
    render(view());
    await act(async () => { pick("19_21"); });
    expect(checked()).toBe("none");
    expect(screen.getByRole("alert").textContent).toBe(t.slotChangeClosed);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("adopts a different saved slot from a refreshed server render, clearing old feedback", async () => {
    changeTimeSlotAction.mockResolvedValue({ ok: false, error: "invalid" });
    const { rerender } = render(view("none"));
    await act(async () => { pick("morning"); });
    expect(screen.getByRole("alert")).toBeTruthy();
    rerender(view("18_20"));
    expect(checked()).toBe("18_20");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps its own 'Saved.' when the refreshed render brings back the value it just saved", async () => {
    changeTimeSlotAction.mockResolvedValue(ok("morning"));
    const { rerender } = render(view("none"));
    await act(async () => { pick("morning"); });
    rerender(view("morning"));
    expect(checked()).toBe("morning");
    expect(screen.getByRole("status").textContent).toBe(t.saved);
  });

  it("doesn't let a refreshed render overwrite a choice that is still saving", async () => {
    const save = deferred<unknown>();
    changeTimeSlotAction.mockReturnValue(save.promise);
    const { rerender } = render(view("none"));
    await act(async () => { pick("14_16"); });
    rerender(view("18_20"));
    expect(checked()).toBe("14_16");
    await act(async () => { save.resolve(ok("14_16")); });
    expect(checked()).toBe("14_16");
  });
});
