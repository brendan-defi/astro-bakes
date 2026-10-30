import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderNoteForm } from "./OrderNoteForm";

const actions = vi.hoisted(() => ({ addOrderNoteAction: vi.fn() }));
vi.mock("@/app/admin/(app)/orders/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const note = () => screen.getByLabelText("Add a note") as HTMLTextAreaElement;
const add = () => screen.getByRole("button", { name: /Add note|Saving/ }) as HTMLButtonElement;

beforeEach(() => { actions.addOrderNoteAction.mockReset(); router.refresh.mockReset(); });
afterEach(() => { cleanup(); });

describe("OrderNoteForm", () => {
  it("adds a note, clears the box and refreshes the timeline", async () => {
    actions.addOrderNoteAction.mockResolvedValue({ ok: true });
    render(<OrderNoteForm number="AB-005-001" />);
    expect(add().disabled).toBe(true);
    fireEvent.change(note(), { target: { value: "Leave with the concierge." } });
    fireEvent.click(add());
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.addOrderNoteAction).toHaveBeenCalledWith("AB-005-001", "Leave with the concierge.");
    expect(note().value).toBe("");
  });

  it("keeps the text and says why when the server refuses it or the request fails", async () => {
    actions.addOrderNoteAction.mockResolvedValueOnce({ ok: false, error: "At most 2,000 characters (this is 2,001)." }).mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<OrderNoteForm number="AB-005-001" />);
    fireEvent.change(note(), { target: { value: "x".repeat(2001) } });
    fireEvent.click(add());
    expect((await screen.findByRole("alert")).textContent).toBe("At most 2,000 characters (this is 2,001).");
    expect(note().getAttribute("aria-invalid")).toBe("true");
    expect(note().value).toHaveLength(2001);
    fireEvent.click(add());
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't save the note/);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
