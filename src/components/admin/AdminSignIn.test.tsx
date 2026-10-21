import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreMotion, stubAnimate, stubMatchMedia } from "@/test/motion";
import { AdminSignIn } from "./AdminSignIn";

const actions = vi.hoisted(() => ({ requestAdminSignInAction: vi.fn(), verifyAdminCodeAction: vi.fn(), signOutAdminAction: vi.fn() }));
vi.mock("@/app/admin/auth/actions", () => actions);
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const mount = (error: string | null = null) => render(<AdminSignIn next="/admin/orders" error={error} />);
async function askForCode(email = "owner@example.com") {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  await screen.findByText("Check your email");
}
const enterCode = (code: string) => fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: code } });

beforeEach(() => {
  stubMatchMedia(true);
  stubAnimate();
  window.sessionStorage.clear();
  actions.requestAdminSignInAction.mockReset();
  actions.verifyAdminCodeAction.mockReset();
  router.replace.mockReset();
  actions.requestAdminSignInAction.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  restoreMotion();
});

describe("AdminSignIn", () => {
  it("keeps the code screen across a reload, under its own key, so the code already sent still works", async () => {
    const first = mount();
    await askForCode();
    expect(actions.requestAdminSignInAction).toHaveBeenCalledWith({ email: "owner@example.com", next: "/admin/orders" });
    expect(JSON.parse(window.sessionStorage.getItem("ab-admin-auth-pending")!)).toMatchObject({ email: "owner@example.com" });
    expect(window.sessionStorage.getItem("ab-auth-pending")).toBeNull();
    first.unmount();

    mount();
    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(screen.getByText(/If owner@example\.com is the admin account/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Resend in/ }) as HTMLButtonElement).disabled).toBe(true);
    actions.verifyAdminCodeAction.mockResolvedValue({ ok: true, next: "/admin/orders" });
    enterCode("123456");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/orders"));
    expect(actions.verifyAdminCodeAction).toHaveBeenCalledWith({ email: "owner@example.com", code: "123456" });
    expect(actions.requestAdminSignInAction).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("ab-admin-auth-pending")).toBeNull();
  });

  it("forgets the address when they choose a different email", async () => {
    const first = mount();
    await askForCode();
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(window.sessionStorage.getItem("ab-admin-auth-pending")).toBeNull();
    first.unmount();
    mount();
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeTruthy();
  });

  it("says so when asking for a code fails outright, and keeps the address for another try", async () => {
    actions.requestAdminSignInAction.mockRejectedValueOnce(new Error("Failed to fetch"));
    mount();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Something went wrong/);
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("owner@example.com");
    expect((screen.getByRole("button", { name: "Email me a code" }) as HTMLButtonElement).disabled).toBe(false);
    expect(window.sessionStorage.getItem("ab-admin-auth-pending")).toBeNull();
  });

  it("says so when checking the code fails outright, and lets them try again", async () => {
    mount();
    await askForCode();
    actions.verifyAdminCodeAction.mockRejectedValueOnce(new Error("Failed to fetch"));
    enterCode("123456");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Something went wrong/);
    expect(router.replace).not.toHaveBeenCalled();
    const cont = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(cont.disabled).toBe(false);
    actions.verifyAdminCodeAction.mockResolvedValueOnce({ ok: true, next: "/admin" });
    fireEvent.click(cont);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
  });

  it("explains a link opened in another browser", () => {
    mount("other_browser");
    expect(screen.getByRole("alert").textContent).toMatch(/different browser/);
  });
});
