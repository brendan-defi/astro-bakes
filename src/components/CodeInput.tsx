import { useEffect, useRef, useState } from "react";
import { CODE_LENGTH, cleanCode, codeInPaste } from "@/lib/sign-in-code";
import s from "./checkout.module.css";

/**
 * The one 6-digit field (HANDOFF: inputmode=numeric, autocomplete=one-time-code) on the sign-in page and the
 * checkout. Pasting the code in whatever shape the email gives it fills the whole field, full-width digits count,
 * and a code the person completes submits the form, so paste (or the phone's autofill) signs them straight in.
 */
export function CodeInput({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  // The raw text while an IME is composing: cleaning it mid-composition would throw the composition away.
  const [composing, setComposing] = useState<string | null>(null);
  // Submit only after the completed code has rendered, so the form's handler sees it.
  const submitWhenRendered = useRef(false);

  const commit = (text: string) => {
    const code = cleanCode(text);
    if (code.length === CODE_LENGTH && code !== value) submitWhenRendered.current = true;
    onChange(code);
  };

  useEffect(() => {
    if (!submitWhenRendered.current || value.length !== CODE_LENGTH) return;
    submitWhenRendered.current = false;
    ref.current?.form?.requestSubmit();
  }, [value]);

  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      className={`input ${s.codeInput}`}
      value={composing ?? value}
      onChange={(e) => {
        if ((e.nativeEvent as InputEvent).isComposing) return setComposing(e.target.value);
        setComposing(null);
        commit(e.target.value);
      }}
      onCompositionEnd={(e) => {
        setComposing(null);
        commit(e.currentTarget.value);
      }}
      onPaste={(e) => {
        // A whole code replaces what's there, wherever the caret is; anything else pastes normally and gets cleaned.
        const code = codeInPaste(e.clipboardData.getData("text"));
        if (!code) return;
        e.preventDefault();
        commit(code);
      }}
    />
  );
}
