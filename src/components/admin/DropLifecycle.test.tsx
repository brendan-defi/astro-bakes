import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DropLifecycle } from "./DropLifecycle";

const actions = vi.hoisted(() => ({ transitionDropAction: vi.fn(), saveDropAction: vi.fn(), duplicateDropAction: vi.fn() }));
vi.mock("@/app/admin/(app)/drops/actions", () => actions);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const mount = (state: Parameters<typeof DropLifecycle>[0]["state"], stored = state) =>
  render(<DropLifecycle slug="drop-05" number={5} state={state} storedState={stored} reopenDefault="2026-11-11T21:00" />);
const button = (name: string) => screen.getByRole("button", { name });

describe("DropLifecycle", () => {
  beforeEach(() => { actions.transitionDropAction.mockReset(); router.refresh.mockReset(); });
  afterEach(cleanup);

  it("offers the moves the state allows, each explained", () => {
    mount("draft");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Schedule", "Open now"]);
    expect(screen.getByText(/Schedule: The shop shows it as coming up/)).toBeTruthy();
    cleanup();
    mount("complete");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.getByText("Nothing to do: the drop is complete.")).toBeTruthy();
  });

  it("runs a quiet action at once and refreshes the page with the result", async () => {
    actions.transitionDropAction.mockResolvedValue({ ok: true, state: "scheduled" });
    mount("draft");
    fireEvent.click(button("Schedule"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Schedule: done. Drop 05 is scheduled."));
    expect(actions.transitionDropAction).toHaveBeenCalledWith("drop-05", "schedule", {});
    expect(router.refresh).toHaveBeenCalled();
  });

  it("asks twice before opening, and says what opening does", async () => {
    actions.transitionDropAction.mockResolvedValue({ ok: true, state: "open" });
    mount("scheduled");
    fireEvent.click(button("Open now"));
    expect(actions.transitionDropAction).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: /Open now: Drop 05\?/ }).textContent).toMatch(/Customers can order from this moment/);
    fireEvent.click(button("Cancel"));
    expect(screen.queryByRole("group")).toBeNull();
    fireEvent.click(button("Open now"));
    fireEvent.click(button("Yes, open now"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.transitionDropAction).toHaveBeenCalledWith("drop-05", "open", {});
  });

  it("reopen takes the new closing time, prefilled, and sends it along", async () => {
    actions.transitionDropAction.mockResolvedValue({ ok: true, state: "open" });
    mount("closed");
    fireEvent.click(button("Reopen"));
    const when = screen.getByLabelText("Closes (Japan time)") as HTMLInputElement;
    expect(when.value).toBe("2026-11-11T21:00");
    fireEvent.change(when, { target: { value: "2026-11-13T21:00" } });
    fireEvent.click(button("Yes, reopen"));
    await waitFor(() => expect(actions.transitionDropAction).toHaveBeenCalledWith("drop-05", "reopen", { closeAt: "2026-11-13T21:00" }));
  });

  it("shows a refusal as an alert and leaves the page alone", async () => {
    actions.transitionDropAction.mockResolvedValue({ ok: false, error: "Drop 04 is open now. Close it first; only one drop can be open at a time." });
    mount("draft");
    fireEvent.click(button("Open now"));
    fireEvent.click(button("Yes, open now"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/^Drop 04 is open now/));
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("group")).toBeTruthy(); // the question stays, so the owner can cancel or try again
  });

  it("keeps Mark complete for a drop the clock finished but that isn't stored complete", () => {
    mount("complete", "shipped");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Mark complete"]);
  });
});

describe("DropLifecycle held back", () => {
  it("disables the buttons and says why while the form beside it has unsaved changes", () => {
    render(<DropLifecycle slug="drop-05" number={5} state="scheduled" storedState="scheduled" reopenDefault="2026-11-11T21:00" blocked="Save or discard the form's changes first: a lifecycle action reloads the drop as it is stored." />);
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Save or discard the form's changes first/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open now" }));
    expect(screen.queryByRole("group")).toBeNull();
  });
});
