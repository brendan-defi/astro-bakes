import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@/lib/i18n";
import { OptInButton } from "./OptInButton";

const particles = vi.hoisted(() => ({ burst: vi.fn() }));
vi.mock("@/lib/particles", () => particles);
const actions = vi.hoisted(() => ({ setMarketingOptInAction: vi.fn() }));
vi.mock("@/app/[locale]/account/actions", () => actions);

beforeEach(() => { actions.setMarketingOptInAction.mockReset(); });
afterEach(() => { cleanup(); particles.burst.mockReset(); });
const t = getStrings("en");
const mount = () => render(<OptInButton locale="en" variant="hero" label="Email me when Drop 04 opens" consent={t.dropEmailsOnly} doneText={t.onListFor("Drop 04")} />);

describe("OptInButton", () => {
  it("turns drop emails on with one tap, then shows the status with a link to the settings", async () => {
    actions.setMarketingOptInAction.mockResolvedValue({ ok: true });
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Email me when Drop 04 opens" })); });
    expect(actions.setMarketingOptInAction).toHaveBeenCalledWith(true);
    expect(screen.getByText(t.onListFor("Drop 04"))).toBeTruthy();
    expect(screen.getByRole("link", { name: `${t.emailSettings} →` }).getAttribute("href")).toBe("/en/account#notify-h");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the button and explains when it didn't save", async () => {
    actions.setMarketingOptInAction.mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error("network"));
    mount();
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("alert").textContent).toBe(t.saveFailed);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("alert").textContent).toBe(t.saveFailed);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });
});
