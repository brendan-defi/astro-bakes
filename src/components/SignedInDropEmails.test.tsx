import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@/lib/i18n";
import { SignedInDropEmails } from "./SignedInDropEmails";

const particles = vi.hoisted(() => ({ burst: vi.fn() }));
vi.mock("@/lib/particles", () => particles);
const actions = vi.hoisted(() => ({ setMarketingOptInAction: vi.fn() }));
vi.mock("@/app/[locale]/account/actions", () => actions);

// Block bodies on purpose: a returned mock would be run as a vitest cleanup after each test.
beforeEach(() => { actions.setMarketingOptInAction.mockReset(); });
afterEach(() => { cleanup(); particles.burst.mockReset(); });
const t = getStrings("en");
const status = t.onListFor("Drop 04");
const view = (optedIn: boolean, variant: "hero" | "section" = "hero") => (
  <SignedInDropEmails locale="en" variant={variant} optedIn={optedIn} statusText={status} label="Email me when Drop 04 opens" consent={t.dropEmailsOnly} />
);
const settingsLink = () => screen.getByRole("link", { name: `${t.emailSettings} →` });

describe("SignedInDropEmails", () => {
  it("shows a customer on the list a status and a settings link, and announces nothing on arrival", () => {
    render(view(true));
    expect(screen.getByText(status)).toBeTruthy();
    expect(settingsLink().getAttribute("href")).toBe("/en/account#notify-h");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  for (const variant of ["hero", "section"] as const) {
    it(`(${variant}) turns drop emails on with one tap, announces it, and moves focus to the settings link`, async () => {
      actions.setMarketingOptInAction.mockResolvedValue({ ok: true });
      render(view(false, variant));
      const button = screen.getByRole("button", { name: "Email me when Drop 04 opens" });
      button.focus();
      await act(async () => { fireEvent.click(button); });
      expect(actions.setMarketingOptInAction).toHaveBeenCalledWith(true);
      expect(screen.getByRole("status").textContent).toBe(status);
      expect(document.activeElement).toBe(settingsLink());
      expect(screen.queryByRole("button")).toBeNull();
    });
  }

  it("keeps the announcement and focus when the refreshed server render arrives with the new preference", async () => {
    actions.setMarketingOptInAction.mockResolvedValue({ ok: true });
    const { rerender } = render(view(false));
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    rerender(view(true));
    expect(screen.getByRole("status").textContent).toBe(status);
    expect(document.activeElement).toBe(settingsLink());
  });

  it("keeps the button and explains when it didn't save", async () => {
    actions.setMarketingOptInAction.mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error("network"));
    render(view(false));
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("alert").textContent).toBe(t.saveFailed);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("alert").textContent).toBe(t.saveFailed);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("follows the server when the preference was switched off elsewhere", () => {
    const { rerender } = render(view(true));
    rerender(view(false));
    expect(screen.getByRole("button", { name: "Email me when Drop 04 opens" })).toBeTruthy();
  });
});
