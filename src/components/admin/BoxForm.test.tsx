import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoxValue } from "@/lib/catalogue-rules";
import { BoxForm } from "./BoxForm";

const actions = vi.hoisted(() => ({ saveBoxAction: vi.fn() }));
vi.mock("@/app/admin/(app)/boxes/actions", () => actions);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ITEMS = [{ slug: "choc-chip", name: "Chocolate chip cookie" }, { slug: "matcha", name: "Matcha cookie" }, { slug: "cake-slice", name: "Cake, slice" }];
const BOX: BoxValue = {
  slug: "cookie-box", nameEn: "4 Cookie Box", nameJa: "4種のクッキーボックス", descriptionEn: "Soft middles.", descriptionJa: "", contentsEn: "4 cookies", contentsJa: "クッキー4枚",
  price: 1000, allergens: ["Egg", "Wheat"], active: true, defaultCap: 20, defaultMaxPerCustomer: 5, sort: 0, recipe: [{ itemSlug: "choc-chip", qty: 2 }, { itemSlug: "matcha", qty: 2 }],
};
const save = () => screen.getByRole("button", { name: /Create box|Save box|Saving/ }) as HTMLButtonElement;
const status = () => screen.getByRole("status").textContent;
const sent = () => actions.saveBoxAction.mock.calls.at(-1)!;

beforeEach(() => { actions.saveBoxAction.mockReset(); router.push.mockReset(); });
afterEach(() => { cleanup(); });

describe("BoxForm", () => {
  it("suggests the slug from the English name while creating, and goes to the new box once it's created", async () => {
    actions.saveBoxAction.mockResolvedValue({ ok: true, slug: "brownie-box", value: { ...BOX, slug: "brownie-box" } });
    render(<BoxForm slug={null} initial={null} items={ITEMS} />);
    fireEvent.change(screen.getByLabelText("English", { selector: "#box-nameEn" }), { target: { value: "Brownie Box" } });
    expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe("brownie-box");
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "brownies" } });
    fireEvent.change(screen.getByLabelText("English", { selector: "#box-nameEn" }), { target: { value: "Brownie Box!" } });
    expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe("brownies");
    fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "cake-slice" } });
    fireEvent.click(save());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/boxes/brownie-box?created=1"));
    expect(sent()[1]).toBeNull();
    expect(sent()[0]).toMatchObject({ slug: "brownies", nameEn: "Brownie Box!", recipe: [{ itemSlug: "cake-slice", qty: "1" }] });
  });

  it("edits the recipe: add, change, remove, and an item can only be picked once", async () => {
    actions.saveBoxAction.mockImplementation(async (draft: Record<string, unknown>) => ({ ok: true, slug: "cookie-box", value: { ...BOX, recipe: draft.recipe } }));
    render(<BoxForm slug="cookie-box" initial={BOX} items={ITEMS} />);
    expect(screen.getByText("cookie-box")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Slug" })).toBeNull();
    expect(save().disabled).toBe(true);
    // Matcha is taken by line 2, so line 1 can't choose it.
    const matchaOption = within(screen.getByLabelText("Item 1")).getByRole("option", { name: "Matcha cookie" }) as HTMLOptionElement;
    expect(matchaOption.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "+ Add an item" }));
    fireEvent.change(screen.getByLabelText("Item 3"), { target: { value: "cake-slice" } });
    fireEvent.change(screen.getByLabelText("Quantity of item 3"), { target: { value: "1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(status()).toBe("Unsaved changes");
    fireEvent.click(save());
    await waitFor(() => expect(status()).toMatch(/^Saved/));
    expect(sent()[1]).toBe("cookie-box");
    expect(sent()[0].recipe).toEqual([{ itemSlug: "choc-chip", qty: "2" }, { itemSlug: "cake-slice", qty: "1" }]);
  });

  it("ticks allergens from the two lists", async () => {
    actions.saveBoxAction.mockResolvedValue({ ok: true, slug: "cookie-box", value: BOX });
    render(<BoxForm slug="cookie-box" initial={BOX} items={ITEMS} />);
    expect((screen.getByRole("checkbox", { name: /^Egg/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /^Walnut/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Almond/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Wheat/ }));
    fireEvent.click(save());
    await waitFor(() => expect(actions.saveBoxAction).toHaveBeenCalled());
    expect(sent()[0].allergens).toEqual(["Egg", "Walnut", "Almond"]);
  });

  it("shows the server's errors by the field or recipe line, focusing the first", async () => {
    actions.saveBoxAction.mockResolvedValue({ ok: false, errors: { price: "A whole number from 50 to 100,000.", "recipe.1": "This item is already in the box; change the quantity instead." } });
    render(<BoxForm slug="cookie-box" initial={BOX} items={ITEMS} />);
    fireEvent.change(screen.getByLabelText("Price (税込) *"), { target: { value: "10" } });
    fireEvent.click(save());
    expect(await screen.findByText("A whole number from 50 to 100,000.")).toBeTruthy();
    expect(screen.getByText(/already in the box/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Price (税込) *"));
    expect(status()).toMatch(/need fixing/);
  });
});
