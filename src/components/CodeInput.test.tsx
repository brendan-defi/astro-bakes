import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreMotion, stubAnimate, stubMatchMedia } from "@/test/motion";
import { CodeInput } from "./CodeInput";

type State = { checking?: boolean; done?: boolean; misses?: number };

function Harness({ onSubmit, initial = "", ...state }: { onSubmit: (code: string) => void; initial?: string } & State) {
  const [code, setCode] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(code); }}>
      <label htmlFor="c">Code</label>
      <CodeInput id="c" value={code} onChange={setCode} doneLabel="You're in!" {...state} />
    </form>
  );
}
function mount(initial?: string, state: State = {}) {
  const onSubmit = vi.fn();
  const view = render(<Harness onSubmit={onSubmit} initial={initial} {...state} />);
  const update = (next: State) => view.rerender(<Harness onSubmit={onSubmit} initial={initial} {...next} />);
  const tiles = () => [...view.container.querySelectorAll<HTMLElement>("[data-candy]")];
  const field = () => view.container.querySelector<HTMLElement>("[data-state]")!;
  return { input: screen.getByLabelText("Code") as HTMLInputElement, onSubmit, update, tiles, field };
}
const paste = (el: HTMLElement, text: string) => fireEvent.paste(el, { clipboardData: { getData: () => text } });

afterEach(() => {
  cleanup();
  restoreMotion();
  vi.useRealTimers();
  document.querySelector("[data-particles]")?.remove();
});

describe("CodeInput: entering the code", () => {
  it("fills the whole code from the email's spaced-out digits and signs straight in", () => {
    const { input, onSubmit } = mount();
    paste(input, "1 2 3 4 5 6");
    expect(input.value).toBe("123456");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("123456");
  });

  it("replaces a code that's already there when a new one is pasted", () => {
    const { input, onSubmit } = mount("111111");
    paste(input, "Your code: 482913");
    expect(input.value).toBe("482913");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("482913");
  });

  it("waits for the sixth typed digit before submitting", () => {
    const { input, onSubmit } = mount();
    fireEvent.change(input, { target: { value: "12345" } });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "123456" } });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("123456");
    fireEvent.change(input, { target: { value: "1234567" } });
    expect(input.value).toBe("123456");
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("takes full-width digits, and leaves an IME's composing text alone until it's committed", () => {
    const { input, onSubmit } = mount();
    fireEvent.input(input, { target: { value: "１２" }, isComposing: true });
    expect(input.value).toBe("１２");
    fireEvent.compositionEnd(input, { target: { value: "１２３４５６" } });
    expect(input.value).toBe("123456");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("123456");
  });

  it("lets a partial paste in like typing", () => {
    const { input, onSubmit } = mount("12");
    paste(input, "34");
    fireEvent.change(input, { target: { value: "1234" } }); // what the browser's own paste produces
    expect(input.value).toBe("1234");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the caret after the last digit, wherever the tap lands", () => {
    const { input } = mount("1234");
    fireEvent.focus(input);
    input.setSelectionRange(1, 1);
    fireEvent.select(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([4, 4]);
  });

  it("lets a pasted code land before submitting it, when there's motion", () => {
    stubMatchMedia(false);
    stubAnimate();
    vi.useFakeTimers();
    const { input, onSubmit } = mount();
    paste(input, "123456");
    expect(onSubmit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("123456");
  });
});

describe("CodeInput: the tiles", () => {
  it("shows one digit per tile and lights up the next one while focused", () => {
    const { input, tiles } = mount("12");
    fireEvent.focus(input);
    expect(tiles().map((t) => t.textContent)).toEqual(["1", "2", "", "", "", ""]);
    expect(tiles().map((t) => t.hasAttribute("data-active"))).toEqual([false, false, true, false, false, false]);
    fireEvent.blur(input);
    expect(tiles().some((t) => t.hasAttribute("data-active"))).toBe(false);
  });

  it("bobs while a whole code is being checked", () => {
    const { field, update } = mount("123456", { checking: true });
    expect(field().dataset.state).toBe("checking");
    update({ checking: false });
    expect(field().dataset.state).toBe("idle");
  });

  it("shakes on a turned-down code and selects it, so the next digit or paste starts over", () => {
    stubMatchMedia(false);
    const calls = stubAnimate();
    const { input, tiles, update } = mount("123456", { misses: 0 });
    update({ misses: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].el).toBe(tiles()[0].parentElement);
    expect(calls[0].keyframes.map((k) => k.translate)).toContain("-12px");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 6]);
    expect(tiles().every((t) => t.hasAttribute("data-selected"))).toBe(true);
    fireEvent.change(input, { target: { value: "7" } });
    expect(input.value).toBe("7");
    expect(tiles().some((t) => t.hasAttribute("data-selected"))).toBe(false);
  });

  it("doesn't shake under reduced motion, but still selects the code", () => {
    stubMatchMedia(true);
    const calls = stubAnimate();
    const { input, update } = mount("123456", { misses: 0 });
    update({ misses: 1 });
    expect(calls).toHaveLength(0);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 6]);
  });

  it("announces an accepted code, stamps the sticker on and throws a little burst from it", () => {
    stubMatchMedia(false);
    stubAnimate();
    vi.useFakeTimers();
    const { input, field, update } = mount("123456");
    expect(screen.getByRole("status").textContent).toBe("");
    update({ done: true });
    expect(field().dataset.state).toBe("done");
    expect(screen.getByRole("status").textContent).toBe("You're in!");
    expect(input.readOnly).toBe(true);
    expect(document.querySelector("[data-particles]")).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(document.querySelector("[data-particles]")?.childElementCount).toBeGreaterThan(0);
  });
});
