import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreMotion, stubAnimate, stubMatchMedia } from "@/test/motion";
import { HeroAstro } from "./HeroAstro";

const particles = vi.hoisted(() => ({ burst: vi.fn() }));
vi.mock("@/lib/particles", () => particles);

afterEach(() => { cleanup(); restoreMotion(); particles.burst.mockReset(); });
const hero = () => render(<HeroAstro photo="/images/astro-cookie.jpg" alt="Astro the Australian Shepherd" bubble="Drop 03 is open!" />);

describe("HeroAstro", () => {
  it("throws paws, hearts and cookies from where Astro is tapped", () => {
    hero();
    fireEvent.pointerDown(screen.getByRole("img", { name: "Astro the Australian Shepherd" }), { clientX: 120, clientY: 340 });
    expect(particles.burst).toHaveBeenCalledWith({ x: 120, y: 340 }, expect.objectContaining({ kind: ["paw", "heart", "cookie", "paw"] }));
  });

  it("showers cookies when the orbiting cookie is caught", () => {
    const { container } = hero();
    const cookie = container.querySelector('svg[viewBox="0 0 64 64"]')!;
    fireEvent.pointerDown(cookie);
    expect(particles.burst).toHaveBeenCalledWith(cookie, expect.objectContaining({ kind: expect.arrayContaining(["cookie"]) }));
  });

  it("keeps the photo a plain image: its alt text, no button, no tab stop", () => {
    const { container } = hero();
    expect(screen.getByRole("img", { name: "Astro the Australian Shepherd" })).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("leaves the cookie at rest when the viewer prefers reduced motion", () => {
    const calls = stubAnimate();
    stubMatchMedia(true);
    hero();
    expect(calls).toHaveLength(0);
  });
});
