import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTING_DEFAULTS, validateSettings } from "@/lib/settings-fields";
import { SettingsForm } from "./SettingsForm";

const actions = vi.hoisted(() => ({ saveSettingsAction: vi.fn() }));
vi.mock("@/app/admin/(app)/settings/actions", () => actions);

const initial = { ...SETTING_DEFAULTS, legal_seller_name: "並川洋美" };
const save = () => screen.getByRole("button", { name: /Save settings|Saving/ }) as HTMLButtonElement;
const status = () => screen.getByRole("status").textContent;

beforeEach(() => { actions.saveSettingsAction.mockReset(); });
afterEach(() => { cleanup(); });

describe("SettingsForm", () => {
  it("shows every section with the stored values, and only offers to save once something changes", () => {
    render(<SettingsForm initial={initial} />);
    for (const title of ["Store", "特定商取引法に基づく表記", "Notifications", "Shipping and labels"]) expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect((screen.getByLabelText("販売業者 (seller)") as HTMLInputElement).value).toBe("並川洋美");
    expect((screen.getByLabelText("Email me on each new order") as HTMLInputElement).checked).toBe(true);
    expect(save().disabled).toBe(true);
    // The shipping fee is shown, not editable.
    expect(screen.getByText("¥0, included in the box price (D19)")).toBeTruthy();
    expect(screen.queryByLabelText("Shipping fee (税込)")).toBeNull();
    fireEvent.change(screen.getByLabelText("Owner email"), { target: { value: "owner@example.com" } });
    expect(save().disabled).toBe(false);
    expect(status()).toBe("Unsaved changes");
  });

  it("sends the whole form, then shows the saved (normalised) values", async () => {
    actions.saveSettingsAction.mockImplementation(async () => ({ ok: true, values: { ...initial, owner_email: "owner@example.com", arrival_offset_days: 3 } }));
    render(<SettingsForm initial={initial} />);
    fireEvent.change(screen.getByLabelText("Owner email"), { target: { value: " Owner@Example.com " } });
    fireEvent.change(screen.getByLabelText("Expected arrival"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Mark as fragile (こわれもの)"));
    fireEvent.click(save());
    await waitFor(() => expect(status()).toMatch(/^Saved/));
    const sent = actions.saveSettingsAction.mock.calls[0][0];
    // Browsers trim an email field's value themselves; the server lower-cases it.
    expect(sent).toMatchObject({ owner_email: "Owner@Example.com", arrival_offset_days: "3", jp_fragile: false, legal_seller_name: "並川洋美" });
    expect((screen.getByLabelText("Owner email") as HTMLInputElement).value).toBe("owner@example.com");
  });

  it("keeps showing the stored shipping fee after a save, whose answer leaves read-only fields out", async () => {
    // The real action's answer: validateSettings' editable values only, no shipping_fee.
    actions.saveSettingsAction.mockImplementation(async (draft: Record<string, unknown>) => validateSettings(draft));
    render(<SettingsForm initial={{ ...initial, shipping_fee: 800 }} />);
    expect(screen.getByText("¥800 per order")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Owner email"), { target: { value: "owner@example.com" } });
    fireEvent.click(save());
    await waitFor(() => expect(status()).toMatch(/^Saved/));
    expect("shipping_fee" in (await actions.saveSettingsAction.mock.results[0].value).values).toBe(false);
    expect(screen.getByText("¥800 per order")).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it("marks the fields the server turned down, focuses the first, and clears a mark once it's edited", async () => {
    actions.saveSettingsAction.mockResolvedValue({ ok: false, errors: { contact_email: "Required.", jp_sender_postal: "Seven digits, like 153-0061." } });
    render(<SettingsForm initial={initial} />);
    fireEvent.change(screen.getByLabelText("Contact email *"), { target: { value: "" } });
    fireEvent.click(save());
    expect(await screen.findByText("Required.")).toBeTruthy();
    expect(screen.getByText("Seven digits, like 153-0061.")).toBeTruthy();
    const contact = screen.getByLabelText("Contact email *");
    expect(contact.getAttribute("aria-invalid")).toBe("true");
    // Focus moves in an effect after the errors render, so under load it can land a moment later.
    await waitFor(() => expect(document.activeElement).toBe(contact));
    expect(status()).toMatch(/need fixing/);
    fireEvent.change(contact, { target: { value: "hello@astrobakes.xyz" } });
    expect(screen.queryByText("Required.")).toBeNull();
  });

  it("locks the fields while a save is in flight, so a later edit can't be lost to its answer", async () => {
    let finish!: (v: unknown) => void;
    actions.saveSettingsAction.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<SettingsForm initial={initial} />);
    const owner = screen.getByLabelText("Owner email") as HTMLInputElement;
    fireEvent.change(owner, { target: { value: "first@example.com" } });
    fireEvent.click(save());
    await waitFor(() => expect(owner.matches(":disabled")).toBe(true));
    expect((screen.getByLabelText("販売業者 (seller)") as HTMLInputElement).matches(":disabled")).toBe(true);
    finish({ ok: true, values: { ...initial, owner_email: "first@example.com" } });
    await waitFor(() => expect(status()).toMatch(/^Saved/));
    expect(owner.matches(":disabled")).toBe(false);
    expect(owner.value).toBe("first@example.com");
  });

  it("says so when saving fails outright, and keeps the edits", async () => {
    actions.saveSettingsAction.mockRejectedValue(new Error("Failed to fetch"));
    render(<SettingsForm initial={initial} />);
    fireEvent.change(screen.getByLabelText("Owner email"), { target: { value: "owner@example.com" } });
    fireEvent.click(save());
    await waitFor(() => expect(status()).toMatch(/Couldn't save/));
    expect((screen.getByLabelText("Owner email") as HTMLInputElement).value).toBe("owner@example.com");
    expect(save().disabled).toBe(false);
  });
});
