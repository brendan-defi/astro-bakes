import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DropLifecycle } from "./DropLifecycle";

const actions = vi.hoisted(() => ({ transitionDropAction: vi.fn(), cancelDropAction: vi.fn(), resendDropEmailsAction: vi.fn(), saveDropAction: vi.fn(), duplicateDropAction: vi.fn() }));
vi.mock("@/app/admin/(app)/drops/actions", () => actions);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const mount = (state: Parameters<typeof DropLifecycle>[0]["state"], stored = state) =>
  render(<DropLifecycle slug="drop-05" number={5} state={state} storedState={stored} reopenDefault="2026-11-11T21:00" />);
const button = (name: string) => screen.getByRole("button", { name });

describe("DropLifecycle", () => {
  beforeEach(() => { actions.transitionDropAction.mockReset(); actions.cancelDropAction.mockReset(); actions.resendDropEmailsAction.mockReset(); router.refresh.mockReset(); });
  afterEach(cleanup);

  it("offers the moves the state allows, each explained", () => {
    mount("draft");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Schedule", "Open now", "Cancel drop"]);
    expect(screen.getByText(/Schedule: The shop shows it as coming up/)).toBeTruthy();
    cleanup();
    mount("complete");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.getByText("Nothing to do: the drop is complete.")).toBeTruthy();
  });

  it("offers Mark complete again on a completed drop with an order shipped after it was marked, and says why", async () => {
    actions.transitionDropAction.mockResolvedValue({ ok: true, state: "complete" });
    render(<DropLifecycle slug="drop-05" number={5} state="complete" storedState="complete" reopenDefault="2026-11-11T21:00" undelivered={1} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Mark complete"]);
    expect(screen.getByText("One order shipped after the drop was marked complete; once it has arrived, Mark complete shows it as delivered too.")).toBeTruthy();
    fireEvent.click(button("Mark complete"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.transitionDropAction).toHaveBeenCalledWith("drop-05", "complete", {});
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

  it("Cancel drop says what it will cancel and refund, and has to be typed out", async () => {
    actions.cancelDropAction.mockResolvedValue({ ok: true, cancelled: 3, refund: 4500, emailed: 2, emailFailed: 1 });
    render(<DropLifecycle slug="drop-05" number={5} state="open" storedState="open" reopenDefault="2026-11-11T21:00" cancelImpact={{ orders: 3, refund: 4500, version: "v1" }} />);
    fireEvent.click(button("Cancel drop"));
    expect(screen.getByRole("group", { name: /Cancel drop: Drop 05\?/ }).textContent).toMatch(/refunding each in full\. This can't be undone\. That's 3 orders and ¥4,500 of refunds, recorded as owed \(Stripe isn't connected yet, so no money moves\)\. Each customer is emailed/);
    const yes = button("Yes, cancel drop") as HTMLButtonElement;
    expect(yes.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type “cancel” to confirm"), { target: { value: "cancl" } });
    expect(yes.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type “cancel” to confirm"), { target: { value: " Cancel " } });
    expect(yes.disabled).toBe(false);
    fireEvent.click(yes);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Drop 05 is cancelled: 3 orders cancelled, ¥4,500 of refunds recorded as owed, 2 customers emailed; 1 email didn't go out (send them again below)."));
    expect(actions.cancelDropAction).toHaveBeenCalledWith("drop-05", "v1");
    expect(actions.transitionDropAction).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("Cancel drop on a drop with no orders says so, and backing out leaves it", async () => {
    actions.cancelDropAction.mockResolvedValue({ ok: false, error: "That drop no longer exists." });
    mount("draft");
    fireEvent.click(button("Cancel drop"));
    expect(screen.getByRole("group").textContent).toMatch(/It has no orders\./);
    fireEvent.click(button("Keep the drop"));
    expect(screen.queryByRole("group")).toBeNull();
    fireEvent.click(button("Cancel drop"));
    fireEvent.change(screen.getByLabelText("Type “cancel” to confirm"), { target: { value: "cancel" } });
    fireEvent.click(button("Keep the drop"));
    fireEvent.click(button("Cancel drop"));
    expect((screen.getByLabelText("Type “cancel” to confirm") as HTMLInputElement).value).toBe(""); // starts empty each time
    fireEvent.change(screen.getByLabelText("Type “cancel” to confirm"), { target: { value: "cancel" } });
    fireEvent.click(button("Yes, cancel drop"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That drop no longer exists."));
    expect(actions.cancelDropAction).toHaveBeenCalledWith("drop-05", "");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("when the orders changed since the page loaded, keeps the question open and reloads the numbers", async () => {
    actions.cancelDropAction.mockResolvedValue({ ok: false, stale: true, error: "The orders on this drop have changed since this page loaded (a checkout finished, or an order was cancelled or refunded). The numbers above are up to date now: check them, then confirm again." });
    render(<DropLifecycle slug="drop-05" number={5} state="open" storedState="open" reopenDefault="2026-11-11T21:00" cancelImpact={{ orders: 1, refund: 1000, version: "old" }} />);
    fireEvent.click(button("Cancel drop"));
    fireEvent.change(screen.getByLabelText("Type “cancel” to confirm"), { target: { value: "cancel" } });
    fireEvent.click(button("Yes, cancel drop"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/^The orders on this drop have changed/));
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole("group")).toBeTruthy();
  });

  it("offers to send a cancelled drop's emails that didn't go out", async () => {
    actions.resendDropEmailsAction.mockResolvedValue({ ok: true, emailed: 2, emailFailed: 0 });
    render(<DropLifecycle slug="drop-05" number={5} state="cancelled" storedState="cancelled" reopenDefault="2026-11-11T21:00" emailsOwed={2} />);
    expect(screen.queryByText(/Nothing to do/)).toBeNull();
    expect(screen.getByText("2 customers haven't had their cancellation email yet: a send failed, or it was interrupted.")).toBeTruthy();
    fireEvent.click(button("Send them now"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 cancellation emails sent."));
    expect(actions.resendDropEmailsAction).toHaveBeenCalledWith("drop-05");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("keeps Mark complete for a drop the clock finished but that isn't stored complete", () => {
    mount("complete", "shipped");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Mark complete"]);
  });
});

describe("DropLifecycle held back", () => {
  afterEach(cleanup);
  it("disables the buttons and says why while the form beside it has unsaved changes", () => {
    render(<DropLifecycle slug="drop-05" number={5} state="scheduled" storedState="scheduled" reopenDefault="2026-11-11T21:00" blocked="Save or discard the form's changes first: a lifecycle action reloads the drop as it is stored." />);
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Save or discard the form's changes first/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open now" }));
    expect(screen.queryByRole("group")).toBeNull();
  });
});

describe("DropLifecycle guards the confirmation too", () => {
  beforeEach(() => { actions.transitionDropAction.mockReset(); actions.cancelDropAction.mockReset(); actions.resendDropEmailsAction.mockReset(); router.refresh.mockReset(); });
  afterEach(cleanup);
  it("won't run a confirmed action once the form has become dirty, and says so", () => {
    const view = (blocked?: string) => <DropLifecycle slug="drop-05" number={5} state="scheduled" storedState="scheduled" reopenDefault="2026-11-11T21:00" blocked={blocked} />;
    const r = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Open now" }));
    r.rerender(view("Save or discard the form's changes first: a lifecycle action reloads the drop as it is stored."));
    expect((screen.getByRole("button", { name: "Yes, open now" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/Save or discard/);
    fireEvent.click(screen.getByRole("button", { name: "Yes, open now" }));
    expect(actions.transitionDropAction).not.toHaveBeenCalled();
  });

  it("reports when it is active: from the confirmation opening until the request settles", async () => {
    const onActiveChange = vi.fn();
    let settle!: (v: unknown) => void;
    actions.transitionDropAction.mockReturnValue(new Promise((r) => { settle = r; }));
    render(<DropLifecycle slug="drop-05" number={5} state="scheduled" storedState="scheduled" reopenDefault="2026-11-11T21:00" onActiveChange={onActiveChange} />);
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Open now" }));
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Yes, open now" }));
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
    await act(async () => { settle({ ok: true, state: "open" }); });
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });
});
