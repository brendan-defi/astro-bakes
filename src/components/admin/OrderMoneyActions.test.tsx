import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderMoneyActions, type OrderMoneyActionsProps } from "./OrderMoneyActions";

const actions = vi.hoisted(() => ({ cancelOrderAction: vi.fn(), refundOrderAction: vi.fn(), addOrderNoteAction: vi.fn() }));
vi.mock("@/app/admin/(app)/orders/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const props: OrderMoneyActionsProps = { number: "AB-005-001", canCancel: true, refundable: 2500, refunded: 0, dropOpen: true, email: "hanako@example.test" };
const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

beforeEach(() => { actions.cancelOrderAction.mockReset(); actions.refundOrderAction.mockReset(); router.refresh.mockReset(); });
afterEach(cleanup);

describe("OrderMoneyActions", () => {
  it("offers cancel & refund and a refund, with what's left and that no money moves yet", () => {
    render(<OrderMoneyActions {...props} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Cancel & refund…", "Refund…"]);
    expect(screen.getByText(/¥2,500 left to refund\. Stripe isn't connected yet/)).toBeTruthy();
    cleanup();
    render(<OrderMoneyActions {...props} canCancel={false} refundable={0} />);
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.getByText("Nothing left to cancel or refund.")).toBeTruthy();
  });

  it("cancels after saying what happens: the refund, the stock, and the email", async () => {
    actions.cancelOrderAction.mockResolvedValue({ ok: true, refund: 2500, backOnSale: true, emailed: true });
    render(<OrderMoneyActions {...props} />);
    fireEvent.click(button("Cancel & refund…"));
    const q = screen.getByRole("form", { name: /Cancel AB-005-001 and refund ¥2,500\?/ });
    expect(q.textContent).toMatch(/Its boxes go back on sale, since the drop is open\./);
    const email = screen.getByLabelText("Email the customer (hanako@example.test)") as HTMLInputElement;
    expect(email.checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Why (internal, optional)"), { target: { value: "Asked by phone." } });
    fireEvent.click(button("Yes, cancel the order"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Cancelled. A refund of ¥2,500 is recorded as owed. hanako@example.test has been emailed."));
    expect(actions.cancelOrderAction).toHaveBeenCalledWith("AB-005-001", { note: "Asked by phone.", notify: true });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("says when the drop has closed, sends no email when unticked, and backs out with Keep the order", async () => {
    actions.cancelOrderAction.mockResolvedValue({ ok: true, refund: 2500, backOnSale: false, emailed: null });
    render(<OrderMoneyActions {...props} dropOpen={false} />);
    fireEvent.click(button("Cancel & refund…"));
    expect(screen.getByRole("form").textContent).toMatch(/The drop has closed, so its boxes aren't sold again unless you reopen it\./);
    fireEvent.click(button("Keep the order"));
    expect(screen.queryByRole("form")).toBeNull();
    fireEvent.click(button("Cancel & refund…"));
    fireEvent.click(screen.getByLabelText(/Email the customer/));
    fireEvent.click(button("Yes, cancel the order"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Cancelled. A refund of ¥2,500 is recorded as owed. The customer wasn't emailed."));
    expect(actions.cancelOrderAction).toHaveBeenCalledWith("AB-005-001", { note: "", notify: false });
  });

  it("keeps the question open with the reason when the server refuses", async () => {
    actions.cancelOrderAction.mockResolvedValue({ ok: false, error: "This order is already cancelled." });
    render(<OrderMoneyActions {...props} />);
    fireEvent.click(button("Cancel & refund…"));
    fireEvent.click(button("Yes, cancel the order"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This order is already cancelled."));
    expect(screen.getByRole("form")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("records a refund: checks the amount and reason first, then sends what the page showed as refunded", async () => {
    actions.refundOrderAction.mockResolvedValue({ ok: true, amount: 500 });
    render(<OrderMoneyActions {...props} refundable={2000} refunded={500} />);
    fireEvent.click(button("Refund…"));
    expect(screen.getByRole("form", { name: /Refund without cancelling/ }).textContent).toMatch(/Up to ¥2,000/);
    fireEvent.change(screen.getByLabelText("Amount (¥)"), { target: { value: "2,500" } });
    fireEvent.click(button("Record the refund"));
    expect(screen.getByText("At most ¥2,000 is left to refund.")).toBeTruthy();
    expect(screen.getByText("Pick a reason.")).toBeTruthy();
    expect(screen.getByLabelText("Amount (¥)").getAttribute("aria-invalid")).toBe("true");
    expect(actions.refundOrderAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Amount (¥)"), { target: { value: "¥500" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "other" } });
    expect(screen.getByLabelText("Note (internal)")).toBeTruthy(); // Other wants a note
    fireEvent.click(button("Record a refund of ¥500"));
    expect(screen.getByText("Say what it's for. Only the shop sees this.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Note (internal)"), { target: { value: "Goodwill: late delivery." } });
    fireEvent.click(button("Record a refund of ¥500"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("A refund of ¥500 is recorded as owed."));
    expect(actions.refundOrderAction).toHaveBeenCalledWith("AB-005-001", { amount: "¥500", reason: "other", note: "Goodwill: late delivery." }, 500);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows the server's field errors and its refusal", async () => {
    actions.refundOrderAction.mockResolvedValueOnce({ ok: false, error: "Another refund was recorded since this page loaded. Check the timeline, then try again." });
    render(<OrderMoneyActions {...props} canCancel={false} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Refund…"]);
    fireEvent.click(button("Refund…"));
    fireEvent.change(screen.getByLabelText("Amount (¥)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "damage" } });
    fireEvent.click(button("Record a refund of ¥500"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/^Another refund was recorded/));
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
