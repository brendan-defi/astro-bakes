import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OptInToggle } from "./OptInToggle";

const setMarketingOptInAction = vi.fn();
vi.mock("@/app/[locale]/account/actions", () => ({ setMarketingOptInAction: (...a: unknown[]) => setMarketingOptInAction(...a) }));

describe("OptInToggle", () => {
  // Block body on purpose: a returned mock would be run as a vitest cleanup after each test.
  beforeEach(() => { setMarketingOptInAction.mockReset(); });
  afterEach(cleanup);

  it("keeps the new value when the server accepts it", async () => {
    setMarketingOptInAction.mockResolvedValue({ ok: true });
    render(<OptInToggle locale="en" initial={true} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    await act(async () => { fireEvent.click(box); });
    expect(box.checked).toBe(false);
    expect(setMarketingOptInAction).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("restores the previous value and explains when the request rejects", async () => {
    setMarketingOptInAction.mockRejectedValue(new Error("network"));
    render(<OptInToggle locale="en" initial={true} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    await act(async () => { fireEvent.click(box); });
    expect(screen.getByRole("alert").textContent).toMatch(/didn't save/);
    expect(box.checked).toBe(true); // not left looking opted out
    expect(box.disabled).toBe(false);
  });

  it("restores the previous value when the server declines", async () => {
    setMarketingOptInAction.mockResolvedValue({ ok: false });
    render(<OptInToggle locale="en" initial={false} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    await act(async () => { fireEvent.click(box); });
    expect(box.checked).toBe(false);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
