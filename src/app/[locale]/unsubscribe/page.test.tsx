import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settings as defaults } from "@/lib/data";
import { getStrings } from "@/lib/i18n";

const calls = vi.hoisted(() => ({ unsubscribe: vi.fn(), redirect: vi.fn((to: string) => { throw new Error(`redirect:${to}`); }) }));
vi.mock("@/lib/unsubscribe", async (original) => ({ ...(await original<typeof import("@/lib/unsubscribe")>()), unsubscribe: calls.unsubscribe }));
vi.mock("@/lib/drops", () => ({ loadSettings: async () => defaults }));
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), redirect: calls.redirect }));
import { unsubscribeParams } from "@/lib/unsubscribe";
import UnsubscribePage from "./page";
import { confirmUnsubscribeAction } from "./actions";

const en = getStrings("en");
const ja = getStrings("ja");
const show = async (locale: "en" | "ja", q: Record<string, string>) =>
  render(await UnsubscribePage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(q) }));
const form = (values: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, v); return f; };

// Block bodies on purpose: a returned mock would be run as a vitest cleanup after each test.
beforeEach(() => { calls.unsubscribe.mockReset().mockResolvedValue({ subscriber: true, customer: false }); calls.redirect.mockClear(); });
afterEach(cleanup);

describe("unsubscribe page", () => {
  it("only asks when the link is opened: names the masked address, posts the signed values, changes nothing", async () => {
    const p = unsubscribeParams("hanako@example.com")!;
    await show("en", p);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(en.unsubscribeTitle);
    expect(screen.getByText(en.unsubscribeConfirm("h***@example.com"))).toBeTruthy();
    const button = screen.getByRole("button", { name: en.unsubscribeButton });
    const values = Object.fromEntries(new FormData(button.closest("form")!));
    expect(values).toEqual({ locale: "en", e: p.e, t: p.t });
    expect(calls.unsubscribe).not.toHaveBeenCalled();
  });

  it("keeps the signed values when switching language, so the link still works in the other one", async () => {
    const p = unsubscribeParams("hanako@example.com")!;
    await show("en", p);
    const toJa = new URL(screen.getByRole("link", { name: "JA" }).getAttribute("href")!, "https://astrobakes.xyz");
    expect(toJa.pathname).toBe("/ja/unsubscribe");
    expect(toJa.searchParams.get("e")).toBe(p.e);
    expect(toJa.searchParams.get("t")).toBe(p.t);
  });

  it("refuses a tampered link: no form, and the contact address instead", async () => {
    const p = unsubscribeParams("hanako@example.com")!;
    await show("ja", { e: p.e, t: "forged" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(ja.unsubscribeInvalidTitle);
    expect(screen.queryByRole("button", { name: ja.unsubscribeButton })).toBeNull();
    expect(screen.getByText(ja.unsubscribeInvalidBody(defaults.contactEmail))).toBeTruthy();
  });

  for (const [locale, t] of [["en", en], ["ja", ja]] as const) {
    it(`(${locale}) offers both ways back without saying which applies: account settings, or the homepage`, async () => {
      await show(locale, { done: "1" });
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(t.unsubscribeDoneTitle);
      expect(screen.getByRole("link", { name: t.emailSettings }).getAttribute("href")).toBe(`/${locale}/account#notify-h`);
      expect(screen.getByRole("link", { name: t.rejoinHomepage }).getAttribute("href")).toBe(`/${locale}#notify`);
    });
  }
});

describe("confirmUnsubscribeAction", () => {
  it("unsubscribes the signed address and shows the done page in the same language", async () => {
    const p = unsubscribeParams("Hanako@Example.com")!;
    await expect(confirmUnsubscribeAction(form({ locale: "ja", ...p }))).rejects.toThrow("redirect:/ja/unsubscribe?done=1");
    expect(calls.unsubscribe).toHaveBeenCalledWith("hanako@example.com");
  });

  it("does nothing for tampered values, and falls back to English for an unknown language", async () => {
    const p = unsubscribeParams("hanako@example.com")!;
    await expect(confirmUnsubscribeAction(form({ locale: "xx", e: p.e, t: "forged" }))).rejects.toThrow("redirect:/en/unsubscribe");
    expect(calls.unsubscribe).not.toHaveBeenCalled();
  });
});
