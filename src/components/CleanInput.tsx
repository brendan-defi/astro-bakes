"use client";

import { useLayoutEffect, useReducer, useRef, useState, type InputHTMLAttributes } from "react";

/**
 * A text input that only keeps what `clean` allows, so a letter never lands in a phone or postal-code field.
 * Text a Japanese IME is still composing shows as typed and is cleaned once committed (cleaning it mid-composition
 * throws the composition away), and the caret stays put rather than jumping to the end when a character is dropped.
 */
export function CleanInput({ clean, value, onValueChange, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  clean: (text: string) => string;
  value: string;
  /** Called only when the cleaned value differs from `value`. */
  onValueChange: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [composing, setComposing] = useState<string | null>(null);
  const caret = useRef<number | null>(null);
  // React puts the old value back when a keystroke is dropped, which moves the caret; a render lets the effect restore it.
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const commit = (el: HTMLInputElement) => {
    const next = clean(el.value);
    caret.current = clean(el.value.slice(0, el.selectionStart ?? el.value.length)).length;
    if (next !== value) onValueChange(next);
    rerender();
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (caret.current === null || !el || document.activeElement !== el) return;
    el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  return (
    <input
      ref={ref}
      {...rest}
      value={composing ?? value}
      onChange={(e) => {
        if ((e.nativeEvent as InputEvent).isComposing) return setComposing(e.target.value);
        setComposing(null);
        commit(e.target);
      }}
      onCompositionEnd={(e) => {
        setComposing(null);
        commit(e.currentTarget);
      }}
    />
  );
}
