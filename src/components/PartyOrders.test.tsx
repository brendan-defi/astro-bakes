import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PartyOrders } from "./PartyOrders";

const particles = vi.hoisted(() => ({ burst: vi.fn() }));
vi.mock("@/lib/particles", () => particles);

afterEach(() => { cleanup(); particles.burst.mockReset(); });

describe("PartyOrders", () => {
  it("spews cookies from whichever cookie is tapped", () => {
    const { container } = render(<PartyOrders locale="en" />);
    const cookies = [...container.querySelectorAll('svg[viewBox="0 0 64 64"]')];
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      fireEvent.pointerDown(cookie);
      expect(particles.burst).toHaveBeenLastCalledWith(cookie, expect.objectContaining({ kind: expect.arrayContaining(["cookie"]) }));
    }
  });

  it("keeps the cookies decorative: no buttons, no tab stops", () => {
    const { container } = render(<PartyOrders locale="en" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });
});
