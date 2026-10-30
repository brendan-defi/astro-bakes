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
