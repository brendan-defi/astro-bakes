import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeInput } from "./CodeInput";

function Harness({ onSubmit, initial = "" }: { onSubmit: (code: string) => void; initial?: string }) {
  const [code, setCode] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(code); }}>
      <label htmlFor="c">Code</label>
      <CodeInput id="c" value={code} onChange={setCode} />
    </form>
  );
}
function mount(initial?: string) {
  const onSubmit = vi.fn();
  render(<Harness onSubmit={onSubmit} initial={initial} />);
  return { field: screen.getByLabelText("Code") as HTMLInputElement, onSubmit };
}
const paste = (field: HTMLElement, text: string) => fireEvent.paste(field, { clipboardData: { getData: () => text } });

afterEach(() => { cleanup(); });

describe("CodeInput", () => {
  it("fills the whole code from the email's spaced-out digits and signs straight in", () => {
    const { field, onSubmit } = mount();
    paste(field, "1 2 3 4 5 6");
    expect(field.value).toBe("123456");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("123456");
  });

  it("replaces a code that's already there when a new one is pasted", () => {
    const { field, onSubmit } = mount("111111");
    paste(field, "Your code: 482913");
    expect(field.value).toBe("482913");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("482913");
  });

  it("waits for the sixth typed digit before submitting", () => {
    const { field, onSubmit } = mount();
    fireEvent.change(field, { target: { value: "12345" } });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "123456" } });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("123456");
    fireEvent.change(field, { target: { value: "1234567" } });
    expect(field.value).toBe("123456");
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("takes full-width digits, and leaves an IME's composing text alone until it's committed", () => {
    const { field, onSubmit } = mount();
    fireEvent.input(field, { target: { value: "１２" }, isComposing: true });
    expect(field.value).toBe("１２");
    fireEvent.compositionEnd(field, { target: { value: "１２３４５６" } });
    expect(field.value).toBe("123456");
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("123456");
  });

  it("lets a partial paste in like typing", () => {
    const { field, onSubmit } = mount("12");
    paste(field, "34");
    fireEvent.change(field, { target: { value: "1234" } }); // what the browser's own paste produces
    expect(field.value).toBe("1234");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
