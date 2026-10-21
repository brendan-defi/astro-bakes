import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanPhoneInput } from "@/lib/phone";
import { CleanInput } from "./CleanInput";

function mount(initial = "") {
  const onValueChange = vi.fn();
  function Field() {
    const [value, setValue] = useState(initial);
    return <CleanInput aria-label="Phone" type="tel" clean={cleanPhoneInput} value={value} onValueChange={(v) => { onValueChange(v); setValue(v); }} />;
  }
  render(<Field />);
  return { input: screen.getByLabelText("Phone") as HTMLInputElement, onValueChange };
}

/** Type into the field with the caret at `caret`, the way a keystroke in the middle of the text arrives. */
function typeAt(input: HTMLInputElement, value: string, caret: number) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.setSelectionRange(caret, caret);
  fireEvent.input(input);
}

describe("CleanInput", () => {
  afterEach(cleanup);

  it("never lets a letter in", () => {
    const { input, onValueChange } = mount();
    fireEvent.change(input, { target: { value: "dsfasd" } });
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "090-1234-5678x" } });
    expect(input.value).toBe("090-1234-5678");
    expect(onValueChange).toHaveBeenLastCalledWith("090-1234-5678");
  });

  it("only reports a change when the cleaned value changed", () => {
    const { input, onValueChange } = mount("090");
    fireEvent.change(input, { target: { value: "090a" } });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.value).toBe("090");
  });

  it("keeps the caret where a dropped character was typed", () => {
    const { input } = mount("0901234");
    input.focus();
    typeAt(input, "090x1234", 4);
    expect(input.value).toBe("0901234");
    expect(input.selectionStart).toBe(3);
  });

  it("leaves an IME's composing text alone, then cleans it once committed", () => {
    const { input, onValueChange } = mount();
    fireEvent.input(input, { target: { value: "０９０ー" }, isComposing: true });
    expect(input.value).toBe("０９０ー");
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input, { target: { value: "０９０ー１２３４" } });
    expect(input.value).toBe("090-1234");
  });
});
