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
