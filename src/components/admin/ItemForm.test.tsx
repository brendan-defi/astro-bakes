import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemForm } from "./ItemForm";

const actions = vi.hoisted(() => ({ saveItemAction: vi.fn() }));
vi.mock("@/app/admin/(app)/items/actions", () => actions);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ITEM = { slug: "cake-slice", nameEn: "Cake, slice", nameJa: "ケーキ（スライス）", productionUnit: "cake", unitsPerProductionUnit: 12 };
const status = () => screen.getByRole("status").textContent;

beforeEach(() => { actions.saveItemAction.mockReset(); router.push.mockReset(); });
afterEach(() => { cleanup(); });

describe("ItemForm", () => {
  it("creates an item with a slug from its English name, then goes to it", async () => {
    actions.saveItemAction.mockResolvedValue({ ok: true, slug: "brownie", value: { ...ITEM, slug: "brownie" } });
    render(<ItemForm slug={null} initial={null} />);
    fireEvent.change(screen.getByLabelText("Name (English) *"), { target: { value: "Brownie" } });
    fireEvent.change(screen.getByLabelText("Name (Japanese) *"), { target: { value: "ブラウニー" } });
    fireEvent.change(screen.getByLabelText("Baked as *"), { target: { value: "tray" } });
    fireEvent.change(screen.getByLabelText("Per baked unit *"), { target: { value: "16" } });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/items/brownie?created=1"));
    expect(actions.saveItemAction).toHaveBeenCalledWith({ slug: "brownie", nameEn: "Brownie", nameJa: "ブラウニー", productionUnit: "tray", unitsPerProductionUnit: "16" }, null);
  });

  it("edits an item without offering to change its slug, and says when the server turns a field down", async () => {
    actions.saveItemAction.mockResolvedValueOnce({ ok: false, errors: { unitsPerProductionUnit: "A whole number from 1 to 100." } });
    render(<ItemForm slug="cake-slice" initial={ITEM} created />);
    expect(status()).toBe("Created.");
    expect(screen.getByText("cake-slice")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Slug" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Per baked unit *"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    expect(await screen.findByText("A whole number from 1 to 100.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Per baked unit *"));
    actions.saveItemAction.mockResolvedValueOnce({ ok: true, slug: "cake-slice", value: { ...ITEM, unitsPerProductionUnit: 8 } });
    fireEvent.change(screen.getByLabelText("Per baked unit *"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(status()).toBe("Saved."));
    expect(actions.saveItemAction).toHaveBeenLastCalledWith(expect.objectContaining({ unitsPerProductionUnit: "8" }), "cake-slice");
  });
});
