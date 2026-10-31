import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderShipping } from "./OrderShipping";

const actions = vi.hoisted(() => ({ shipOrderAction: vi.fn() }));
vi.mock("@/app/admin/(app)/orders/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const base = { number: "AB-003-001", canShip: true, blocked: null, shipped: false, tracking: null, email: "hanako@example.test" };
const field = () => screen.getByLabelText(/^(Correct tracking number|Tracking number)$/) as HTMLInputElement;

beforeEach(() => { actions.shipOrderAction.mockReset(); router.refresh.mockReset(); });
afterEach(() => { cleanup(); });

describe("OrderShipping", () => {
  it("checks the number before sending, then marks it shipped and says who was emailed", async () => {
    actions.shipOrderAction.mockResolvedValue({ ok: true, emailed: true });
    render(<OrderShipping {...base} />);
    fireEvent.change(field(), { target: { value: "1234-5678" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark shipped" }));
    expect(screen.getByText(/the 12-digit number on the Japan Post label/, { selector: "#ship-tracking-err" })).toBeTruthy();
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(actions.shipOrderAction).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: "1234-5678-9012" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Email the customer/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Email the customer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mark shipped" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.shipOrderAction).toHaveBeenCalledWith("AB-003-001", { tracking: "1234-5678-9012", notify: true, correct: false });
    expect(screen.getByRole("status").textContent).toBe("Shipped. hanako@example.test has been emailed the tracking number.");
  });

  it("shows a server refusal on the field or for the form", async () => {
    actions.shipOrderAction.mockResolvedValueOnce({ ok: false, error: "That's the tracking number it has already.", field: "tracking" }).mockResolvedValueOnce({ ok: false, error: "It was cancelled." });
    render(<OrderShipping {...base} shipped tracking="123456789012" />);
    fireEvent.click(screen.getByRole("button", { name: "Correct the tracking number…" }));
    fireEvent.change(field(), { target: { value: "123456789012" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the correction" }));
    expect(await screen.findByText("That's the tracking number it has already.")).toBeTruthy();
    expect(actions.shipOrderAction).toHaveBeenLastCalledWith("AB-003-001", { tracking: "123456789012", notify: true, correct: true });
    fireEvent.click(screen.getByRole("button", { name: "Save the correction" }));
    expect((await screen.findByRole("alert")).textContent).toBe("It was cancelled.");
  });

  it("shows a shipped order's number with Japan Post's link, and why an unshippable one can't go yet", () => {
    render(<OrderShipping {...base} shipped tracking="123456789012" />);
    expect(screen.getByText("1234-5678-9012")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Track on Japan Post ↗" }).getAttribute("href")).toContain("reqCodeNo1=123456789012");
    expect(screen.queryByLabelText(/^(Correct tracking number|Tracking number)$/)).toBeNull();
    cleanup();
    render(<OrderShipping {...base} canShip={false} blocked="The drop is still open: … so ship once it has closed." />);
    expect(screen.getByText(/ship once it has closed/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark shipped" })).toBeNull();
  });
});
