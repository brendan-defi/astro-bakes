import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeInput } from "@/components/CodeInput";
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

beforeEach(() => {
  actions.verifyCodeAction.mockReset();
  actions.requestSignInAction.mockReset();
});
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

/** Motion on, timers faked, and an accepted code: the celebration's pause is under way once this returns. */
async function celebrating() {
  stubMatchMedia(false);
  stubAnimate();
  vi.useFakeTimers();
  actions.verifyCodeAction.mockResolvedValue({ ok: true, next: "/en/account" });
  const f = flow();
  await act(async () => { void f.hook.result.current.verify(); });
  expect(f.hook.result.current.verified).toBe(true);
  return f;
}

describe("useSignInFlow: leaving or starting over", () => {
  it("doesn't navigate for a page that was left during the celebration", async () => {
    const { hook, onSignedIn } = await celebrating();
    hook.unmount();
    await act(async () => { vi.advanceTimersByTime(CELEBRATE_MS); });
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("lets the person's own navigation win: a link followed, or Back, during the celebration", async () => {
    const link = document.body.appendChild(Object.assign(document.createElement("a"), { href: "#shop", textContent: "Back to the shop" }));
    try {
      const first = await celebrating();
      fireEvent.click(link);
      await act(async () => { vi.advanceTimersByTime(CELEBRATE_MS); });
      expect(first.onSignedIn).not.toHaveBeenCalled();
      expect(first.hook.result.current.busy).toBe(true); // stays put while their page loads
      cleanup();

      const second = await celebrating();
      act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
      await act(async () => { vi.advanceTimersByTime(CELEBRATE_MS); });
      expect(second.onSignedIn).not.toHaveBeenCalled();
      expect(second.hook.result.current.busy).toBe(false); // Back may keep the page (checkout steps), so nothing stays stuck
    } finally {
      link.remove();
    }
  });

  it("carries on when a link is opened in another tab during the celebration", async () => {
    const link = document.body.appendChild(Object.assign(document.createElement("a"), { href: "#shop", textContent: "Back to the shop" }));
    try {
      const { onSignedIn } = await celebrating();
      fireEvent.click(link, { metaKey: true });
      await act(async () => { vi.advanceTimersByTime(CELEBRATE_MS); });
      expect(onSignedIn).toHaveBeenCalledExactlyOnceWith("/en/account");
    } finally {
      link.remove();
    }
  });

  it("cancel() drops the celebration and settles busy, for a page that stays put", async () => {
    const { hook, onSignedIn } = await celebrating();
    act(() => hook.result.current.cancel());
    expect(hook.result.current.busy).toBe(false);
    await act(async () => { vi.advanceTimersByTime(CELEBRATE_MS); });
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("a cancelled check doesn't clear the busy of what came after it", async () => {
    const { hook } = await celebrating();
    act(() => hook.result.current.cancel());
    actions.requestSignInAction.mockReturnValue(new Promise(() => {})); // a new code, still sending
    act(() => { void hook.result.current.request(); });
    expect(hook.result.current.busy).toBe(true);
    await act(async () => { vi.advanceTimersByTime(CELEBRATE_MS); }); // the cancelled check winds down
    expect(hook.result.current.busy).toBe(true);
  });

  it("drops the celebration when the person goes back to change their email", async () => {
    const { hook, onSignedIn } = await celebrating();
    act(() => hook.result.current.reset());
    await act(async () => { vi.advanceTimersByTime(CELEBRATE_MS); });
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(hook.result.current).toMatchObject({ verified: false, busy: false, pending: false });
  });

  it("ignores a check that comes back after the person started over", async () => {
    let answer: (r: unknown) => void = () => {};
    actions.verifyCodeAction.mockReturnValue(new Promise((r) => { answer = r; }));
    const { hook } = flow();
    let finished: Promise<boolean> | undefined;
    await act(async () => { finished = hook.result.current.verify(); });
    act(() => hook.result.current.reset());
    await act(async () => { answer({ ok: false, error: "invalid" }); await finished; });
    expect(hook.result.current).toMatchObject({ notice: null, misses: 0, busy: false });
  });

  it("clears an accepted code when a new one is requested", async () => {
    stubMatchMedia(true);
    actions.verifyCodeAction.mockResolvedValue({ ok: true, next: "/en/account" });
    actions.requestSignInAction.mockResolvedValue({ ok: true });
    const { hook } = flow();
    await act(() => hook.result.current.verify());
    expect(hook.result.current.verified).toBe(true);
    await act(() => hook.result.current.request());
    expect(hook.result.current.verified).toBe(false);
  });
});

/** The hook and the field wired together, as on the sign-in page and in the checkout. */
function CodeScreen({ onSignedIn }: { onSignedIn: (next: string) => void }) {
  const auth = useSignInFlow({ locale: "en", next: () => "/en/account", onSignedIn });
  return (
    <form onSubmit={(e) => { e.preventDefault(); void auth.verify(); }}>
      <label htmlFor="c">Code</label>
      <CodeInput id="c" value={auth.code} onChange={auth.setCode} doneLabel="You're in!" checking={auth.busy} done={auth.verified} misses={auth.misses} />
      <button type="submit">Continue</button>
    </form>
  );
}

describe("useSignInFlow with the code field", () => {
  it("spends one attempt when Continue is pressed while a pasted code is still landing", async () => {
    stubMatchMedia(false);
    stubAnimate();
    vi.useFakeTimers();
    actions.verifyCodeAction.mockResolvedValue({ ok: false, error: "invalid" });
    render(<CodeScreen onSignedIn={vi.fn()} />);
    fireEvent.paste(screen.getByLabelText("Code"), { clipboardData: { getData: () => "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await act(async () => {}); // the quick "wrong code" is back before the cascade would have submitted
    expect(actions.verifyCodeAction).toHaveBeenCalledOnce();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(actions.verifyCodeAction).toHaveBeenCalledOnce();
  });
});
