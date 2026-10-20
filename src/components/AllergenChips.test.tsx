import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AllergenChips } from "./AllergenChips";

const particles = vi.hoisted(() => ({ burst: vi.fn() }));
vi.mock("@/lib/particles", () => particles);

afterEach(() => { cleanup(); particles.burst.mockReset(); });

describe("AllergenChips", () => {
  const items = [{ key: "Egg", label: "卵" }, { key: "Wheat", label: "小麦" }, { key: "Sesame", label: "ごま" }];

  it("throws the pill's own ingredient when tapped", () => {
    render(<AllergenChips items={items} />);
    fireEvent.pointerDown(screen.getByText("卵"));
    expect(particles.burst).toHaveBeenLastCalledWith(screen.getByText("卵"), expect.objectContaining({ kind: "egg" }));
    fireEvent.pointerDown(screen.getByText("小麦"));
    expect(particles.burst).toHaveBeenLastCalledWith(screen.getByText("小麦"), expect.objectContaining({ kind: "wheat" }));
    fireEvent.pointerDown(screen.getByText("ごま"));
    expect(particles.burst).toHaveBeenLastCalledWith(screen.getByText("ごま"), expect.objectContaining({ kind: "sprinkle" }));
  });

  it("stays plain text: no buttons, no tab stops", () => {
    const { container } = render(<AllergenChips items={items} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(container.textContent).toBe("卵小麦ごま");
  });
});
