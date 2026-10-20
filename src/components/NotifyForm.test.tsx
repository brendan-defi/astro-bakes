import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@/lib/i18n";
import { NotifyForm } from "./NotifyForm";

const particles = vi.hoisted(() => ({ burst: vi.fn() }));
vi.mock("@/lib/particles", () => particles);

afterEach(() => { cleanup(); particles.burst.mockReset(); });
const t = getStrings("en");

describe("NotifyForm", () => {
  it("bursts from the button once on signup, then shows the success state", () => {
    render(<NotifyForm locale="en" id="email" variant="hero" label="Email" button="Notify me" consent="" />);
    const button = screen.getByRole("button", { name: "Notify me" });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "you@example.com" } });
    fireEvent.submit(button.closest("form")!);
    expect(particles.burst).toHaveBeenCalledOnce();
    expect(particles.burst).toHaveBeenCalledWith(button, expect.objectContaining({ kind: ["star", "heart", "sprinkle"] }));
    expect(screen.getByRole("status").textContent).toContain(t.notifyDone);
  });

  it("stays quiet when the email is empty", () => {
    render(<NotifyForm locale="en" id="email" variant="section" label="Email" button="Notify me" consent="" />);
    fireEvent.submit(screen.getByRole("button", { name: "Notify me" }).closest("form")!);
    expect(particles.burst).not.toHaveBeenCalled();
  });
});
