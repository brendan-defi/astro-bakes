import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromJstDay, fromJstLocal } from "@/lib/drop-rules";
import { DropEditor } from "./DropEditor";

const actions = vi.hoisted(() => ({ transitionDropAction: vi.fn(), saveDropAction: vi.fn(), duplicateDropAction: vi.fn() }));
vi.mock("@/app/admin/(app)/drops/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const CHOICES = [{ slug: "cookie-box", name: "4 Cookie Box", price: 1000, defaultCap: 20, defaultMaxPerCustomer: 5, active: true }];
const SCHEDULED = {
  nameEn: "Drop 05 · December", nameJa: "ドロップ05 · 12月", descriptionEn: "", descriptionJa: "",
  openAt: fromJstLocal("2026-12-06T10:00")!, closeAt: fromJstLocal("2026-12-13T21:00")!, bakeAt: null, shipAt: fromJstDay("2026-12-20")!,
  boxes: [{ boxSlug: "cookie-box", cap: 20, price: 1000, maxPerCustomer: 5, sold: 0, held: 0 }],
};

describe("DropEditor", () => {
  afterEach(cleanup);
  it("holds the lifecycle buttons back while the form has unsaved changes, and frees them on save or discard", () => {
    render(<DropEditor lifecycle={{ slug: "drop-05", number: 5, state: "scheduled", storedState: "scheduled", reopenDefault: "2026-12-07T21:00" }} form={{ slug: "drop-05", initial: SCHEDULED, number: 5, state: "scheduled", choices: CHOICES, arrivalOffsetDays: 1, version: 1 }} />);
    const openNow = () => screen.getByRole("button", { name: "Open now" }) as HTMLButtonElement;
    expect(openNow().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Ships *"), { target: { value: "2026-12-24" } });
    expect(openNow().disabled).toBe(true);
    expect(screen.getByText(/Save or discard the form's changes first/)).toBeTruthy();
    fireEvent.click(openNow());
    expect(actions.transitionDropAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(openNow().disabled).toBe(false);
    expect((screen.getByLabelText("Ships *") as HTMLInputElement).value).toBe("2026-12-20");
  });
});

describe("DropEditor guards the whole lifecycle operation", () => {
  beforeEach(() => { actions.transitionDropAction.mockReset(); });
  afterEach(cleanup);
  /** Inputs inside a disabled fieldset don't report `disabled` themselves; the fieldset does. */
  const fieldset = () => document.querySelector("fieldset") as HTMLFieldSetElement;
  const mount = () =>
    render(<DropEditor lifecycle={{ slug: "drop-05", number: 5, state: "scheduled", storedState: "scheduled", reopenDefault: "2026-12-07T21:00" }} form={{ slug: "drop-05", initial: SCHEDULED, number: 5, state: "scheduled", choices: CHOICES, arrivalOffsetDays: 1, version: 1 }} />);
  const ships = () => screen.getByLabelText("Ships *") as HTMLInputElement;
  const price = () => screen.getByLabelText(/Price .* for box 1/) as HTMLInputElement;

  it("locks the form from the moment a confirmation opens, and frees it on cancel", () => {
    mount();
    expect(fieldset().disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Open now" }));
    expect(fieldset().disabled).toBe(true);
    expect(ships().matches(":disabled")).toBe(true);
    expect(price().matches(":disabled")).toBe(true);
    expect((screen.getByRole("button", { name: "Save drop" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/A lifecycle action is under way/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fieldset().disabled).toBe(false);
  });

  it("keeps the form locked while the request is in flight, until the refresh", async () => {
    let settle!: (v: unknown) => void;
    actions.transitionDropAction.mockReturnValue(new Promise((r) => { settle = r; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Open now" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, open now" }));
    expect(fieldset().disabled).toBe(true);
    await act(async () => { settle({ ok: true, state: "open" }); });
    expect(fieldset().disabled).toBe(false);
    expect(actions.transitionDropAction).toHaveBeenCalledWith("drop-05", "open", {});
  });
});
