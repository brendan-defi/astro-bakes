import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromJstDay, fromJstLocal } from "@/lib/drop-rules";
import { DropForm } from "./DropForm";

const actions = vi.hoisted(() => ({ saveDropAction: vi.fn(), duplicateDropAction: vi.fn() }));
vi.mock("@/app/admin/(app)/drops/actions", () => actions);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const CHOICES = [
  { slug: "cookie-box", name: "4 Cookie Box", price: 1000, defaultCap: 20, defaultMaxPerCustomer: 5, active: true },
  { slug: "banana-bread", name: "Nebula Banana Bread", price: 500, defaultCap: 10, defaultMaxPerCustomer: 3, active: true },
  { slug: "old-box", name: "Old Box", price: 800, defaultCap: 5, defaultMaxPerCustomer: 2, active: false },
];
const OPEN = {
  nameEn: "Drop 03 · October", nameJa: "ドロップ03 · 10月", descriptionEn: "", descriptionJa: "",
  openAt: fromJstLocal("2026-10-11T12:00")!, closeAt: fromJstLocal("2026-10-30T21:00")!, bakeAt: null, shipAt: fromJstDay("2026-11-02")!,
  boxes: [{ boxSlug: "cookie-box", cap: 20, price: 1000, maxPerCustomer: 5, sold: 13, held: 2 }],
};
const sent = () => actions.saveDropAction.mock.calls.at(-1)!;
const status = () => screen.getByRole("status").textContent;

beforeEach(() => { actions.saveDropAction.mockReset(); router.push.mockReset(); });
afterEach(() => { cleanup(); });

describe("DropForm", () => {
  it("starts a new drop with every active box at its defaults, and opens it once created", async () => {
    actions.saveDropAction.mockResolvedValue({ ok: true, slug: "drop-05" });
    render(<DropForm slug={null} initial={null} number={5} state="draft" choices={CHOICES} arrivalOffsetDays={1} />);
    expect((screen.getByLabelText("Number") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Box 1") as HTMLSelectElement).value).toBe("cookie-box");
    expect((screen.getByLabelText("Box 2") as HTMLSelectElement).value).toBe("banana-bread");
    expect(screen.queryByLabelText("Box 3")).toBeNull();
    fireEvent.change(screen.getByLabelText("Ships *"), { target: { value: "2026-12-20" } });
    expect(screen.getByText(/Arrives Mon, Dec 21/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/drops/drop-05?created=1"));
    expect(sent()[1]).toBeNull();
    expect(sent()[0]).toMatchObject({ number: "5", shipAt: "2026-12-20", boxes: [{ boxSlug: "cookie-box", cap: "20", price: "1000", maxPerCustomer: "5" }, { boxSlug: "banana-bread", cap: "10", price: "500", maxPerCustomer: "3" }] });
  });

  it("fills a new row from the box chosen, and won't offer a box that's already in", () => {
    render(<DropForm slug={null} initial={null} number={5} state="draft" choices={CHOICES} arrivalOffsetDays={1} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add a box" }));
    const box3 = screen.getByLabelText("Box 3") as HTMLSelectElement;
    expect((within(box3).getByRole("option", { name: "4 Cookie Box" }) as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(box3, { target: { value: "old-box" } });
    expect((screen.getByLabelText("Cap for box 3") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText(/Price .* for box 3/) as HTMLInputElement).value).toBe("800");
    expect((screen.getByLabelText("Per customer for box 3") as HTMLInputElement).value).toBe("2");
  });

  it("on an open drop, offers only names, caps and limits; dates, boxes and prices are shown but fixed", () => {
    render(<DropForm slug="drop-03" initial={OPEN} number={3} state="open" choices={CHOICES} arrivalOffsetDays={1} />);
    expect(screen.getByText(/Open and selling/)).toBeTruthy();
    expect(screen.getByText("Drop 03")).toBeTruthy();
    for (const label of ["Opens *", "Closes *", "Bake day (internal)", "Ships *"]) expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Box 1") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Price .* for box 1/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Cap for box 1") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Remove" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "+ Add a box" })).toBeNull();
    expect(screen.getByText("13 sold, 2 in checkouts right now.")).toBeTruthy();
  });

  it("marks and focuses the field the server turned down", async () => {
    actions.saveDropAction.mockResolvedValue({ ok: false, errors: { "boxes.0.cap": "At least 15: 13 sold, 2 in checkouts right now." } });
    render(<DropForm slug="drop-03" initial={OPEN} number={3} state="open" choices={CHOICES} arrivalOffsetDays={1} />);
    const cap = screen.getByLabelText("Cap for box 1");
    fireEvent.change(cap, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save drop" }));
    await waitFor(() => expect(document.activeElement).toBe(cap));
    expect(cap.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(cap.getAttribute("aria-describedby")!)?.textContent).toMatch(/At least 15/);
    expect(status()).toMatch(/need fixing/);
  });
});

describe("DropForm and the state it was drawn for", () => {
  it("sends the state it was drawn for with an edit, and nothing for a new drop", async () => {
    actions.saveDropAction.mockResolvedValue({ ok: true, slug: "drop-03" });
    render(<DropForm slug="drop-03" initial={OPEN} number={3} state="open" choices={CHOICES} arrivalOffsetDays={1} />);
    fireEvent.change(screen.getByLabelText("Cap for box 1"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save drop" }));
    await waitFor(() => expect(status()).toBe("Saved."));
    expect(sent()[2]).toBe("open");
    cleanup();
    actions.saveDropAction.mockResolvedValue({ ok: true, slug: "drop-05" });
    render(<DropForm slug={null} initial={null} number={5} state="draft" choices={CHOICES} arrivalOffsetDays={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(sent()[2]).toBeUndefined();
  });

  it("shows a stale-state refusal with a Reload button and keeps the draft unsaved", async () => {
    router.refresh.mockReset();
    actions.saveDropAction.mockResolvedValue({ ok: false, errors: { state: "This drop is now open, so a different set of fields can change. Reload the page to see what it has now, then make your change again." } });
    render(<DropForm slug="drop-04" initial={OPEN} number={4} state="scheduled" choices={CHOICES} arrivalOffsetDays={1} />);
    fireEvent.change(screen.getByLabelText("Ships *"), { target: { value: "2026-12-24" } });
    fireEvent.click(screen.getByRole("button", { name: "Save drop" }));
    await waitFor(() => expect(status()).toMatch(/^This drop is now open/));
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save drop" }) as HTMLButtonElement).disabled).toBe(false); // still dirty, not "saved"
    expect(router.refresh).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Ships *"), { target: { value: "2026-12-25" } });
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });

  it("links the box picker to its error, like the numeric fields", async () => {
    actions.saveDropAction.mockResolvedValue({ ok: false, errors: { "boxes.0.box": "Choose a box." } });
    render(<DropForm slug={null} initial={null} number={5} state="draft" choices={CHOICES} arrivalOffsetDays={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
    const box = screen.getByLabelText("Box 1");
    await waitFor(() => expect(box.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById(box.getAttribute("aria-describedby")!)?.textContent).toBe("Choose a box.");
  });
});

describe("DropForm when the stored drop changes under it", () => {
  const later = { ...OPEN, closeAt: fromJstLocal("2026-10-31T18:00")!, boxes: [{ ...OPEN.boxes[0], cap: 25 }] };
  const view = (initial: typeof OPEN, version: number, state: "open" | "closed" = "open") =>
    <DropForm slug="drop-03" initial={initial} number={3} state={state} choices={CHOICES} arrivalOffsetDays={1} version={version} />;

  it("shows the stored values once the version changes (a lifecycle action came back)", () => {
    const r = render(view(OPEN, 1));
    expect((screen.getByLabelText("Closes *") as HTMLInputElement).value).toBe("2026-10-30T21:00");
    r.rerender(view(later, 2, "closed"));
    expect((screen.getByLabelText("Closes *") as HTMLInputElement).value).toBe("2026-10-31T18:00");
    expect((screen.getByLabelText("Cap for box 1") as HTMLInputElement).value).toBe("25");
    expect(screen.getByText(/^Closed\./)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save drop" }) as HTMLButtonElement).disabled).toBe(true); // nothing unsaved
  });

  it("keeps an edit in progress but moves the saved baseline, so Save still sends the edit", () => {
    const r = render(view(OPEN, 1));
    fireEvent.change(screen.getByLabelText("Cap for box 1"), { target: { value: "30" } });
    r.rerender(view(later, 2));
    expect((screen.getByLabelText("Cap for box 1") as HTMLInputElement).value).toBe("30");
    expect((screen.getByLabelText("Closes *") as HTMLInputElement).value).toBe("2026-10-30T21:00"); // the draft is the owner's
    expect(status()).toBe("Unsaved changes");
  });

  it("reports unsaved changes to its owner, and Discard changes takes them back", () => {
    const onDirtyChange = vi.fn();
    render(<DropForm slug="drop-03" initial={OPEN} number={3} state="open" choices={CHOICES} arrivalOffsetDays={1} version={1} onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByLabelText("Cap for box 1"), { target: { value: "30" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect((screen.getByLabelText("Cap for box 1") as HTMLInputElement).value).toBe("20");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
  });
});
