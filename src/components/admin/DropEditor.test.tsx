import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
