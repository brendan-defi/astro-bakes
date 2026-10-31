import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderEmails } from "./OrderEmails";

const actions = vi.hoisted(() => ({ resendOrderEmailAction: vi.fn() }));
vi.mock("@/app/admin/(app)/orders/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => { actions.resendOrderEmailAction.mockReset(); router.refresh.mockReset(); });
afterEach(() => { cleanup(); });

describe("OrderEmails", () => {
  it("asks before sending the confirmation again, then says it went", async () => {
    actions.resendOrderEmailAction.mockResolvedValue({ ok: true, emailed: true });
    render(<OrderEmails number="AB-003-001" email="hanako@example.test" confirmation shipped={false} />);
    expect(screen.queryByRole("button", { name: "Resend shipping email…" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resend confirmation…" }));
    expect(screen.getByText("Send the order confirmation to hanako@example.test again?")).toBeTruthy();
    expect(actions.resendOrderEmailAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, send it" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.resendOrderEmailAction).toHaveBeenCalledWith("AB-003-001", "confirmation");
    expect(screen.getByRole("status").textContent).toBe("Sent the order confirmation to hanako@example.test again.");
  });

  it("says when the send failed, and offers the shipping email once shipped", async () => {
    actions.resendOrderEmailAction.mockResolvedValue({ ok: true, emailed: false });
    render(<OrderEmails number="AB-003-001" email="hanako@example.test" confirmation shipped />);
    fireEvent.click(screen.getByRole("button", { name: "Resend shipping email…" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, send it" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The email failed; the timeline has the error.");
    expect(actions.resendOrderEmailAction).toHaveBeenCalledWith("AB-003-001", "shipped");
  });
});
