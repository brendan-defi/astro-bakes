import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreMotion, stubAnimate, stubMatchMedia } from "@/test/motion";
import { HeroAstro } from "./HeroAstro";

const particles = vi.hoisted(() => ({ burst: vi.fn() }));
vi.mock("@/lib/particles", () => particles);

afterEach(() => { cleanup(); restoreMotion(); particles.burst.mockReset(); });
const hero = () => render(<HeroAstro photo="/images/astro-cookie.jpg" alt="Astro the border collie" bubble="Drop 03 is open!" />);

describe("HeroAstro", () => {
  it("throws paws and hearts from where Astro is tapped", () => {
    hero();
    fireEvent.pointerDown(screen.getByRole("img", { name: "Astro the border collie" }), { clientX: 120, clientY: 340 });
    expect(particles.burst).toHaveBeenCalledWith({ x: 120, y: 340 }, expect.objectContaining({ kind: ["paw", "heart", "paw"] }));
  });

  it("keeps the photo a plain image: its alt text, no button, no tab stop", () => {
    const { container } = hero();
    expect(screen.getByRole("img", { name: "Astro the border collie" })).toBeTruthy();
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
