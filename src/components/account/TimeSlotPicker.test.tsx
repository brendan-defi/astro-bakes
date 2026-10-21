import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@/lib/i18n";
import { TimeSlotPicker } from "./TimeSlotPicker";

const changeTimeSlotAction = vi.fn();
const router = { refresh: vi.fn() };
vi.mock("@/app/[locale]/account/actions", () => ({ changeTimeSlotAction: (...a: unknown[]) => changeTimeSlotAction(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = getStrings("en");
const checked = () => (screen.getAllByRole("radio") as HTMLInputElement[]).find((r) => r.checked)?.value;

describe("TimeSlotPicker", () => {
  // Block bodies on purpose: a returned mock would be run as a vitest cleanup after each test.
  beforeEach(() => { changeTimeSlotAction.mockReset(); router.refresh.mockReset(); });
  afterEach(cleanup);

  const mount = () => render(<TimeSlotPicker locale="en" number="AB-003-017" initial="none" legend="Arrives Mon, Oct 26. When suits you?" />);

  it("keeps the new slot when the server accepts it", async () => {
    changeTimeSlotAction.mockResolvedValue({ ok: true, slot: "14_16" });
    mount();
    await act(async () => { fireEvent.click(screen.getByLabelText(t.deliverySlots["14_16"])); });
    expect(changeTimeSlotAction).toHaveBeenCalledWith("AB-003-017", "14_16");
    expect(checked()).toBe("14_16");
    expect(screen.getByRole("status").textContent).toBe(t.saved);
  });

  it("puts the old slot back and says so when the request fails", async () => {
    changeTimeSlotAction.mockRejectedValue(new Error("network"));
    mount();
    await act(async () => { fireEvent.click(screen.getByLabelText(t.deliverySlots.morning)); });
    expect(checked()).toBe("none");
    expect(screen.getByRole("alert").textContent).toBe(t.saveFailed);
  });

  it("puts the old slot back when the server declines", async () => {
    changeTimeSlotAction.mockResolvedValue({ ok: false, error: "invalid" });
    mount();
    await act(async () => { fireEvent.click(screen.getByLabelText(t.deliverySlots.morning)); });
    expect(checked()).toBe("none");
    expect(screen.getByRole("alert").textContent).toBe(t.saveFailed);
  });

  it("explains a closed drop and refreshes so the page shows the slot as fixed", async () => {
    changeTimeSlotAction.mockResolvedValue({ ok: false, error: "closed" });
    mount();
    await act(async () => { fireEvent.click(screen.getByLabelText(t.deliverySlots["19_21"])); });
    expect(checked()).toBe("none");
    expect(screen.getByRole("alert").textContent).toBe(t.slotChangeClosed);
    expect(router.refresh).toHaveBeenCalled();
  });
});
