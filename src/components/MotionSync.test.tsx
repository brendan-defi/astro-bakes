import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MOTION_KEY, PAUSED } from "@/lib/motion-pause";
import { writeStored } from "@/lib/stored";
import { MotionSync } from "./MotionSync";

const attr = () => document.documentElement.dataset.motion;
/** What another tab's write looks like from here: the value is already in storage, then the storage event fires. */
const otherTab = (value: string | null) => {
  if (value === null) localStorage.removeItem(MOTION_KEY);
  else localStorage.setItem(MOTION_KEY, value);
  window.dispatchEvent(new StorageEvent("storage", { key: MOTION_KEY, newValue: value }));
};

describe("MotionSync", () => {
  beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.motion; });
  afterEach(cleanup);

  it("applies the saved switch on mount and follows this tab's writes", () => {
    localStorage.setItem(MOTION_KEY, PAUSED);
    render(<MotionSync />);
    expect(attr()).toBe(PAUSED);
    act(() => writeStored("local", MOTION_KEY, null));
    expect(attr()).toBeUndefined();
    act(() => writeStored("local", MOTION_KEY, PAUSED));
    expect(attr()).toBe(PAUSED);
  });

  it("follows another tab's change in both directions, with no toggle on the page", () => {
    render(<MotionSync />);
    expect(attr()).toBeUndefined();
    act(() => otherTab(PAUSED));
    expect(attr()).toBe(PAUSED);
    act(() => otherTab(null));
    expect(attr()).toBeUndefined();
  });

  it("clears an attribute left from a paused page once the switch is off", () => {
    document.documentElement.dataset.motion = PAUSED;
    render(<MotionSync />);
    expect(attr()).toBeUndefined();
  });
});
