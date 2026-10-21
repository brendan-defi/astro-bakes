import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHome, mockSource } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { Hero } from "./Hero";

vi.mock("@/app/[locale]/actions", () => ({ subscribeAction: vi.fn() }));
vi.mock("@/app/[locale]/account/actions", () => ({ setMarketingOptInAction: vi.fn() }));
vi.mock("@/lib/particles", () => ({ burst: vi.fn(), celebrate: vi.fn(), flyTo: vi.fn() }));

afterEach(cleanup);
const t = getStrings("en");
const scheduled = getHome({ state: "scheduled" }, mockSource);
const withViewer = (viewer: Partial<typeof scheduled.viewer>) => ({ ...scheduled, viewer: { ...scheduled.viewer, ...viewer } });

describe("Hero drop-email status (PRD 1.5, 2.4)", () => {
  it("shows a signed-in customer on the list a status and a link to their settings, not a checkbox", () => {
    render(<Hero locale="en" home={withViewer({ signedIn: true, initial: "H", optedIn: true })} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(t.onListFor(t.dropN(scheduled.drop!.number)))).toBeTruthy();
    expect(screen.getByRole("link", { name: `${t.emailSettings} →` }).getAttribute("href")).toBe("/en/account#notify-h");
  });

  it("offers a signed-in customer without drop emails a one-tap button instead of an email field", () => {
    render(<Hero locale="en" home={withViewer({ signedIn: true, initial: "H", optedIn: false })} />);
    expect(screen.getByRole("button", { name: t.optInNext(t.dropN(scheduled.drop!.number)) })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("asks everyone else for an email", () => {
    render(<Hero locale="en" home={scheduled} />);
    expect(screen.getByRole("textbox", { name: t.remindLabel(t.dropN(scheduled.drop!.number)) })).toBeTruthy();
  });
});
