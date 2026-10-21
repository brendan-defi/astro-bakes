import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@/lib/i18n";
import { NotifyForm } from "./NotifyForm";

const particles = vi.hoisted(() => ({ burst: vi.fn() }));
vi.mock("@/lib/particles", () => particles);
const actions = vi.hoisted(() => ({ subscribeAction: vi.fn() }));
vi.mock("@/app/[locale]/actions", () => actions);

// Block bodies on purpose: a returned mock would be run as a vitest cleanup after each test.
beforeEach(() => { actions.subscribeAction.mockReset(); });
afterEach(() => { cleanup(); particles.burst.mockReset(); });
const t = getStrings("en");
const mount = (variant: "hero" | "section" = "hero") => render(<NotifyForm locale="en" id="email" variant={variant} label="Email" button="Notify me" consent="" />);
const submitWith = async (value: string) => {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
  await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Notify me" }).closest("form")!); });
};

describe("NotifyForm", () => {
  it("saves the signup, then bursts from the button once and shows the success state", async () => {
    actions.subscribeAction.mockResolvedValue({ ok: true });
    mount();
    const button = screen.getByRole("button", { name: "Notify me" });
    await submitWith("you@example.com");
    expect(actions.subscribeAction).toHaveBeenCalledWith({ email: "you@example.com", locale: "en", website: "" });
    expect(particles.burst).toHaveBeenCalledOnce();
    expect(particles.burst).toHaveBeenCalledWith(button, expect.objectContaining({ kind: ["star", "heart", "sprinkle"] }));
    expect(screen.getByRole("status").textContent).toContain(t.notifyDone);
  });

  it("doesn't claim success when the address is rejected, and keeps what was typed", async () => {
    actions.subscribeAction.mockResolvedValue({ ok: false, error: "invalid" });
    mount();
    await submitWith("you@example");
    expect(screen.getByRole("alert").textContent).toBe(t.notifyInvalid);
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("you@example");
    expect(particles.burst).not.toHaveBeenCalled();
  });

  it("says so when saving fails or the request doesn't get through", async () => {
    actions.subscribeAction.mockResolvedValueOnce({ ok: false, error: "failed" }).mockRejectedValueOnce(new Error("network"));
    mount("section");
    await submitWith("you@example.com");
    expect(screen.getByRole("alert").textContent).toBe(t.notifyFailed);
    await submitWith("you@example.com");
    expect(screen.getByRole("alert").textContent).toBe(t.notifyFailed);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays quiet when the email is empty", async () => {
    mount("section");
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Notify me" }).closest("form")!); });
    expect(actions.subscribeAction).not.toHaveBeenCalled();
    expect(particles.burst).not.toHaveBeenCalled();
  });
});
