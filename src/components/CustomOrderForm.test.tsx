import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokyoDay } from "@/lib/custom-order-rules";
import { getStrings } from "@/lib/i18n";
import { CustomOrderForm } from "./CustomOrderForm";

const actions = vi.hoisted(() => ({ submitCustomOrderAction: vi.fn() }));
vi.mock("@/app/[locale]/custom-orders/actions", () => actions);

const t = getStrings("en");
// Far enough ahead that the client-side date check passes whenever the suite runs.
const DATE = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

function mount(initial = { name: "", email: "" }) {
  render(<CustomOrderForm locale="en" initial={initial} dateMin="2026-01-01" dateMax="2099-12-31" />);
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
function fillIn() {
  type(t.yourName, "Hanako");
  type(t.emailAddress, "hanako@example.com");
  type(t.partyDate, DATE);
  fireEvent.click(screen.getByLabelText(t.partySizes["20to50"]));
  fireEvent.click(screen.getByLabelText(t.packagings.sealed));
  fireEvent.click(screen.getByLabelText(t.occasions.wedding));
  type(t.partyDetails, "A tower of cookies, please.");
}
const send = () => fireEvent.click(screen.getByRole("button", { name: t.sendRequest }));

beforeEach(() => { actions.submitCustomOrderAction.mockReset(); });
afterEach(() => { cleanup(); });

describe("CustomOrderForm", () => {
  it("shows what's missing, focuses the first gap, and sends nothing", () => {
    mount();
    send();
    for (const msg of [t.errName, t.errEmail, t.errEventDate, t.errPartySize, t.errPackaging, t.errDetails]) expect(screen.getByText(msg)).toBeTruthy();
    expect(document.activeElement?.id).toBe("co-name");
    expect(screen.getByLabelText(t.yourName).getAttribute("aria-invalid")).toBe("true");
    expect(actions.submitCustomOrderAction).not.toHaveBeenCalled();
  });

  it("asks for a week's notice and warns when a date is under two weeks away", () => {
    mount();
    expect(screen.getByText(t.partyDateHint)).toBeTruthy();
    type(t.partyDate, tokyoDay(new Date(), 10));
    expect(screen.getByText(t.shortNotice)).toBeTruthy();
    expect(screen.getByLabelText(t.partyDate).getAttribute("aria-describedby")).toBe("co-date-hint co-date-short");
    type(t.partyDate, tokyoDay(new Date(), 20));
    expect(screen.queryByText(t.shortNotice)).toBeNull();
  });

  it("refuses a date less than a week away", () => {
    mount();
    fillIn();
    type(t.partyDate, tokyoDay(new Date(), 6));
    send();
    expect(screen.getByText(t.errEventDate)).toBeTruthy();
    expect(screen.queryByText(t.shortNotice)).toBeNull();
    expect(actions.submitCustomOrderAction).not.toHaveBeenCalled();
  });

  it("says it's a request, not an order, before and after sending", async () => {
    actions.submitCustomOrderAction.mockResolvedValue({ ok: true });
    mount();
    expect(screen.getByText(t.requestNotOrder)).toBeTruthy();
    fillIn();
    send();
    expect(await screen.findByText(t.requestSentBody("Hanako", "hanako@example.com"))).toBeTruthy();
  });

  it("offers both packaging choices with the owner's descriptions", () => {
    mount();
    const sealed = screen.getByRole("radio", { name: t.packagings.sealed });
    expect(sealed.getAttribute("aria-describedby")).toBe("co-pack-sealed-desc");
    expect(document.getElementById("co-pack-sealed-desc")?.textContent).toBe(t.packagingDescs.sealed);
    expect(screen.getByRole("radio", { name: t.packagings.unsealed })).toBeTruthy();
  });

  it("clears a field's error as soon as it's fixed", () => {
    mount();
    send();
    type(t.yourName, "Hanako");
    expect(screen.queryByText(t.errName)).toBeNull();
    expect(screen.getByText(t.errEmail)).toBeTruthy();
  });

  it("sends the request with the page's locale and thanks them in place", async () => {
    actions.submitCustomOrderAction.mockResolvedValue({ ok: true });
    mount();
    fillIn();
    send();
    await screen.findByText(t.requestSentTitle);
    expect(actions.submitCustomOrderAction).toHaveBeenCalledWith({
      name: "Hanako", email: "hanako@example.com", eventDate: DATE, partySize: "20to50", packaging: "sealed", occasion: "wedding", details: "A tower of cookies, please.", website: "", locale: "en",
    });
    expect(screen.getByText(t.requestSentBody("Hanako", "hanako@example.com"))).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe(t.requestSentTitle));
  });

  it("sends a null occasion when none was picked, and prefills a signed-in customer", async () => {
    actions.submitCustomOrderAction.mockResolvedValue({ ok: true });
    mount({ name: "Signed In", email: "me@example.com" });
    type(t.partyDate, DATE);
    fireEvent.click(screen.getByLabelText(t.partySizes.upTo20));
    fireEvent.click(screen.getByLabelText(t.packagings.unsealed));
    type(t.partyDetails, "Cookies.");
    send();
    await screen.findByText(t.requestSentTitle);
    expect(actions.submitCustomOrderAction.mock.calls[0][0]).toMatchObject({ name: "Signed In", email: "me@example.com", occasion: null });
  });

  it("says so when they've hit the daily limit, and keeps what they typed", async () => {
    actions.submitCustomOrderAction.mockResolvedValue({ ok: false, error: "rate_limited" });
    mount();
    fillIn();
    send();
    expect((await screen.findByRole("alert")).textContent).toBe(t.requestRateLimited);
    expect((screen.getByLabelText(t.partyDetails) as HTMLTextAreaElement).value).toBe("A tower of cookies, please.");
  });

  it("marks the fields the server rejected", async () => {
    actions.submitCustomOrderAction.mockResolvedValue({ ok: false, error: "invalid", fields: ["eventDate"] });
    mount();
    fillIn();
    send();
    expect(await screen.findByText(t.errEventDate)).toBeTruthy();
  });

  it("asks them to retry when the request never arrives", async () => {
    actions.submitCustomOrderAction.mockRejectedValue(new Error("offline"));
    mount();
    fillIn();
    send();
    expect((await screen.findByRole("alert")).textContent).toBe(t.partyRequestFailed);
    expect(screen.getByRole("button", { name: t.sendRequest }).hasAttribute("disabled")).toBe(false);
  });
});
