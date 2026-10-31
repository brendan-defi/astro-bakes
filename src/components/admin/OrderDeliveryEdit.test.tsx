import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderDeliveryEdit } from "./OrderDeliveryEdit";

const actions = vi.hoisted(() => ({ updateDeliveryAction: vi.fn() }));
vi.mock("@/app/admin/(app)/orders/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const initial = { name: "山田花子", phone: "090-1234-5678", postal: "153-0061", line1: "1-2-3", line2: "", slot: "14_16" };

beforeEach(() => { actions.updateDeliveryAction.mockReset(); router.refresh.mockReset(); });
afterEach(() => { cleanup(); });

describe("OrderDeliveryEdit", () => {
  it("opens with the stored details, shows where a postal code is as it's typed, and saves with the version it started from", async () => {
    actions.updateDeliveryAction.mockResolvedValue({ ok: true, changed: true });
    render(<OrderDeliveryEdit number="AB-003-001" initial={initial} version="v1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit delivery details…" }));
    expect((screen.getByLabelText("Recipient") as HTMLInputElement).value).toBe("山田花子");
    expect(screen.getByText(/^東京都目黒区中目黒 \(Meguro/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Postal code"), { target: { value: "060-0001" } });
    expect(screen.getByText("Outside the 23 wards: we don't deliver there.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Postal code"), { target: { value: "150-0001" } });
    expect(screen.getByText(/東京都渋谷区神宮前/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Time slot"), { target: { value: "18_20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save delivery details" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.updateDeliveryAction).toHaveBeenCalledWith("AB-003-001", { ...initial, postal: "150-0001", slot: "18_20" }, "v1");
    expect(screen.getByRole("status").textContent).toMatch(/^Saved. The customer isn't emailed/);
  });

  it("keeps the version it started from when the page refreshes mid-edit, and won't save over the newer details", async () => {
    actions.updateDeliveryAction.mockResolvedValue({ ok: true, changed: true });
    const { rerender } = render(<OrderDeliveryEdit number="AB-003-001" initial={initial} version="v1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit delivery details…" }));
    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: "鈴木花子" } });
    // The customer moves their slot, and something else on the page (a note, a resend) refreshes it.
    rerender(<OrderDeliveryEdit number="AB-003-001" initial={{ ...initial, slot: "18_20" }} version="v2" />);
    expect(screen.getByRole("alert").textContent).toMatch(/The delivery details changed after you started editing/);
    expect((screen.getByRole("button", { name: "Save delivery details" }) as HTMLButtonElement).disabled).toBe(true);
    // The draft is still the one being typed: not silently re-based on the new details.
    expect((screen.getByLabelText("Recipient") as HTMLInputElement).value).toBe("鈴木花子");
    expect((screen.getByLabelText("Time slot") as HTMLSelectElement).value).toBe("14_16");
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("Time slot") as HTMLSelectElement).value).toBe("18_20");
    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: "鈴木花子" } });
    fireEvent.click(screen.getByRole("button", { name: "Save delivery details" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.updateDeliveryAction).toHaveBeenCalledWith("AB-003-001", { ...initial, name: "鈴木花子", slot: "18_20" }, "v2");
  });

  it("sends the starting version even if the page refreshed with the same details, and refreshes after a stale refusal", async () => {
    actions.updateDeliveryAction.mockResolvedValue({ ok: false, stale: true, error: "The delivery details changed after you started editing." });
    render(<OrderDeliveryEdit number="AB-003-001" initial={initial} version="v1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit delivery details…" }));
    fireEvent.click(screen.getByRole("button", { name: "Save delivery details" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.updateDeliveryAction).toHaveBeenCalledWith("AB-003-001", initial, "v1");
    expect(screen.getByRole("alert").textContent).toBe("The delivery details changed after you started editing.");
  });

  it("marks the fields the server turns down, and shows a stale-page refusal", async () => {
    actions.updateDeliveryAction
      .mockResolvedValueOnce({ ok: false, errors: { phone: "Enter a Japanese phone number, like 090-1234-5678." } })
      .mockResolvedValueOnce({ ok: false, error: "The delivery details changed since this page loaded." });
    render(<OrderDeliveryEdit number="AB-003-001" initial={initial} version="v1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit delivery details…" }));
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save delivery details" }));
    expect(await screen.findByText("Enter a Japanese phone number, like 090-1234-5678.")).toBeTruthy();
    expect(screen.getByLabelText("Phone").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Some fields need fixing; they're marked above.");
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "090-1234-5678" } });
    expect(screen.getByLabelText("Phone").getAttribute("aria-invalid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save delivery details" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The delivery details changed since this page loaded.");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
