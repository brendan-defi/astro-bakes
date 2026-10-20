import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreMotion, stubAnimate, stubMatchMedia } from "@/test/motion";
import { CELEBRATE_MS, useSignInFlow } from "./use-sign-in";

const actions = vi.hoisted(() => ({ requestSignInAction: vi.fn(), verifyCodeAction: vi.fn() }));
vi.mock("@/app/[locale]/auth/actions", () => actions);

function flow() {
  const onSignedIn = vi.fn();
  const hook = renderHook(() => useSignInFlow({ locale: "en", next: () => "/en/account", onSignedIn }));
  act(() => {
    hook.result.current.setEmail("hanako@example.com");
    hook.result.current.setCode("123456");
  });
  return { hook, onSignedIn };
}

beforeEach(() => { actions.verifyCodeAction.mockReset(); });
afterEach(() => {
  cleanup();
  restoreMotion();
  vi.useRealTimers();
});

describe("useSignInFlow: checking the code", () => {
  it("counts each turned-down code, so the field can shake once per miss", async () => {
    actions.verifyCodeAction.mockResolvedValue({ ok: false, error: "invalid" });
    const { hook, onSignedIn } = flow();
    await act(() => hook.result.current.verify());
    await act(() => hook.result.current.verify());
    expect(hook.result.current.misses).toBe(2);
    expect(hook.result.current.verified).toBe(false);
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("marks the code accepted and moves on straight away under reduced motion", async () => {
    stubMatchMedia(true);
    actions.verifyCodeAction.mockResolvedValue({ ok: true, next: "/en/account" });
    const { hook, onSignedIn } = flow();
    await act(() => hook.result.current.verify());
    expect(hook.result.current.verified).toBe(true);
    expect(onSignedIn).toHaveBeenCalledExactlyOnceWith("/en/account");
  });

  it("holds the page for the celebration, staying busy so nothing is sent twice", async () => {
    stubMatchMedia(false);
    stubAnimate();
    vi.useFakeTimers();
    actions.verifyCodeAction.mockResolvedValue({ ok: true, next: "/en/account" });
    const { hook, onSignedIn } = flow();
    let finished: Promise<boolean> | undefined;
    await act(async () => { finished = hook.result.current.verify(); });
    expect(hook.result.current.verified).toBe(true);
    expect(hook.result.current.busy).toBe(true);
    expect(onSignedIn).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(CELEBRATE_MS); await finished; });
    expect(onSignedIn).toHaveBeenCalledExactlyOnceWith("/en/account");
    expect(hook.result.current.busy).toBe(false);
  });
});
