import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MOTION_KEY, PAUSED } from "@/lib/motion-pause";
import { MotionToggle } from "./MotionToggle";

describe("MotionToggle", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("is a pressed toggle with a fixed name that saves the switch", () => {
    render(<MotionToggle locale="en" />);
    const button = screen.getByRole("button", { name: "Pause animations" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(localStorage.getItem(MOTION_KEY)).toBe(PAUSED);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Pause animations");
    fireEvent.click(button);
    expect(localStorage.getItem(MOTION_KEY)).toBeNull();
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a switch saved on an earlier page as pressed, in Japanese too", () => {
    localStorage.setItem(MOTION_KEY, PAUSED);
    render(<MotionToggle locale="ja" />);
    expect(screen.getByRole("button", { name: "アニメーションを一時停止" }).getAttribute("aria-pressed")).toBe("true");
  });
});
