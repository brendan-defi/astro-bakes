import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { motionOK } from "@/lib/motion";
import { burst } from "@/lib/particles";
import { CODE_LENGTH, cleanCode, codeInPaste } from "@/lib/sign-in-code";
import { CheckIcon, StarShape } from "./icons";
import s from "./CodeInput.module.css";

const HALF = CODE_LENGTH / 2;
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
/** One step of a pasted code's cascade (the stylesheet's 45ms), and roughly how long the last tile takes to land. */
const CASCADE_MS = 45;
const LAND_MS = 220;
const SHAKE: Keyframe[] = [{ translate: "0" }, { translate: "-12px" }, { translate: "10px" }, { translate: "-7px" }, { translate: "4px" }, { translate: "0" }];

/** How many leading characters two codes share: those tiles keep their digit, the rest pop in fresh. */
function shared(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * The 6-digit code field on the sign-in page and the checkout. It's still the one real input from the handoff
 * (inputmode=numeric, autocomplete=one-time-code), so paste, the phone's autofill and screen readers all get a plain
 * text field; it just sits invisibly over six candy tiles that show the digits. Pasting the code in whatever shape the
 * email gives it fills every tile, full-width digits count, and a code the person completes submits the form. While
 * it's being checked the tiles bob, a wrong code shakes them, and an accepted one flips them green under a sticker.
 */
export function CodeInput({ id, value, onChange, doneLabel, checking = false, done = false, misses = 0 }: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  /** Shown (and announced) once the code is accepted. */
  doneLabel: string;
  /** The code is being checked. */
  checking?: boolean;
  /** The code was accepted. */
  done?: boolean;
  /** Codes turned down so far: each new one shakes the tiles and selects the code, so typing or pasting replaces it. */
  misses?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const stickerRef = useRef<HTMLSpanElement>(null);
  // The raw text while an IME is composing: cleaning it mid-composition would throw the composition away.
  const [composing, setComposing] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  /** The whole code is selected (after a miss), so the next digit or paste replaces it. */
  const [whole, setWhole] = useState(false);
  // Each digit's key: a digit that changes gets a new one and drops in; `from` places it in a pasted cascade.
  const [stamps, setStamps] = useState<{ from: number; keys: number[] }>({ from: 0, keys: [] });
  const nextKey = useRef(0);
  // Submit only after the completed code has rendered, so the form's handler sees it.
  const submitWhenRendered = useRef(false);
  const autoSubmit = useRef<number | undefined>(undefined);
  const cancelAutoSubmit = useCallback(() => {
    window.clearTimeout(autoSubmit.current);
    autoSubmit.current = undefined;
  }, []);

  const commit = (text: string) => {
    const code = cleanCode(text);
    setWhole(false);
    if (code === value) return;
    const from = shared(value, code);
    setStamps((st) => ({ from, keys: range(0, code.length).map((i) => (i < from ? st.keys[i] : nextKey.current++)) }));
    if (code.length === CODE_LENGTH) submitWhenRendered.current = true;
    onChange(code);
  };

  /** The caret stays after the last digit, so the highlighted tile is always where the next one lands. Select-all is allowed. */
  const pinCaret = (el: HTMLInputElement) => {
    if (composing !== null) return;
    const end = el.value.length;
    const all = end > 0 && el.selectionStart === 0 && el.selectionEnd === end;
    setWhole(all);
    if (!all && (el.selectionStart !== end || el.selectionEnd !== end)) el.setSelectionRange(end, end);
  };

  useEffect(() => {
    if (!submitWhenRendered.current || value.length !== CODE_LENGTH) return;
    submitWhenRendered.current = false;
    // Let a pasted code finish landing first, so checking (and the green flip) come after it rather than over it.
    const submit = () => ref.current?.form?.requestSubmit();
    if (!motionOK()) return submit();
    autoSubmit.current = window.setTimeout(submit, (CODE_LENGTH - 1 - stamps.from) * CASCADE_MS + LAND_MS);
    return cancelAutoSubmit;
  }, [value, stamps.from, cancelAutoSubmit]);

  // Any submission (Continue, Enter, or the automatic one) settles the code, and so does checking or accepting it: a
  // pending automatic submit mustn't send the same code again, which a quick "wrong code" would leave it free to do.
  useEffect(() => {
    const form = ref.current?.form;
    form?.addEventListener("submit", cancelAutoSubmit);
    return () => form?.removeEventListener("submit", cancelAutoSubmit);
  }, [cancelAutoSubmit]);
  useEffect(() => {
    if (checking || done) cancelAutoSubmit();
  }, [checking, done, cancelAutoSubmit]);

  useEffect(() => {
    if (!misses) return;
    ref.current?.focus();
    ref.current?.select();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- goes with the select() above, which the effect has to do
    setWhole(true); // onSelect doesn't reliably fire for a programmatic select()
    if (motionOK()) tilesRef.current?.animate(SHAKE, { duration: 460, easing: "ease-out" });
  }, [misses]);

  useEffect(() => {
    if (!done) return;
    // Thrown as the sticker lands (see .sticker's delay in the stylesheet).
    const t = window.setTimeout(() => burst(stickerRef.current, { kind: ["star", "heart", "sprinkle"], count: 16, power: 440 }), 480);
    return () => window.clearTimeout(t);
  }, [done]);

  const display = composing ?? value;
  const state = done ? "done" : checking && value.length === CODE_LENGTH ? "checking" : "idle";
  const active = focused && !whole && state === "idle" && display.length < CODE_LENGTH ? display.length : -1;

  const tile = (i: number) => {
    const digit = display[i];
    return (
      <span
        // A tile that gets a new digit is a new element, so it drops in afresh (from white) even over an old code.
        key={digit ? `d${stamps.keys[i] ?? `c${i}`}` : `e${i}`}
        className={s.tile}
        data-candy={i % 4}
        data-filled={digit ? "" : undefined}
        data-active={i === active ? "" : undefined}
        data-selected={whole && digit ? "" : undefined}
        style={{ "--i": i, "--d": Math.max(0, i - stamps.from) } as CSSProperties}
      >
        {digit ? <span className={s.digit}>{digit}</span> : i === active ? <span className={s.caret} /> : null}
      </span>
    );
  };

  return (
    <div className={s.field} data-state={state} data-ring={focused && active === -1 && state === "idle" ? "" : undefined}>
      <div ref={tilesRef} className={s.tiles} aria-hidden>
        {range(0, HALF).map(tile)}
        <StarShape className={s.star} fill="var(--butter)" strokeWidth={4} />
        {range(HALF, CODE_LENGTH).map(tile)}
      </div>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        spellCheck={false}
        className={s.input}
        value={display}
        readOnly={done}
        onFocus={(e) => {
          setFocused(true);
          pinCaret(e.currentTarget);
        }}
        onBlur={() => setFocused(false)}
        onSelect={(e) => pinCaret(e.currentTarget)}
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
      {done && (
        <span ref={stickerRef} className={s.sticker} aria-hidden>
          <CheckIcon size={18} />
          {doneLabel}
        </span>
      )}
      <span role="status" className="sr-only">{done ? doneLabel : ""}</span>
    </div>
  );
}
