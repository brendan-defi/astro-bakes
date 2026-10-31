import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackToggle } from "./PackToggle";

const actions = vi.hoisted(() => ({ setPackedAction: vi.fn() }));
vi.mock("@/app/admin/(app)/drops/[slug]/packing/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const box = () => screen.getByRole("checkbox", { name: "AB-003-001 packed" }) as HTMLInputElement;

beforeEach(() => { actions.setPackedAction.mockReset(); router.refresh.mockReset(); });
afterEach(() => { cleanup(); });

describe("PackToggle", () => {
  it("ticks at once, holds still while it saves, then refreshes the list", async () => {
    let finish: (v: unknown) => void = () => {};
    actions.setPackedAction.mockReturnValue(new Promise((r) => { finish = r; }));
    render(<PackToggle number="AB-003-001" packed={false} />);
    fireEvent.click(box());
    expect(box().checked).toBe(true);
    expect(box().disabled).toBe(true);
    expect(actions.setPackedAction).toHaveBeenCalledWith("AB-003-001", true);
    await act(async () => finish({ ok: true, packedAt: new Date() }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(box().disabled).toBe(false);
  });

  it("goes back and says why when the server refuses or the request fails", async () => {
    actions.setPackedAction.mockResolvedValueOnce({ ok: false, error: "It was cancelled." }).mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<PackToggle number="AB-003-001" packed />);
    fireEvent.click(box());
    expect((await screen.findByRole("alert")).textContent).toBe("It was cancelled.");
    expect(box().checked).toBe(true);
    expect(box().getAttribute("aria-describedby")).toBe("pack-AB-003-001-err");
    fireEvent.click(box());
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't save/);
    expect(box().checked).toBe(true);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("can't be ticked while the drop can't be packed", () => {
    render(<PackToggle number="AB-003-001" packed={false} disabled />);
    expect(box().disabled).toBe(true);
  });
});
