/**
 * The sign-in code as people actually enter it: typed, pasted out of the email
 * (spaced out, or with words around it), autofilled by the phone, or typed
 * through a Japanese IME as full-width digits. Client-safe, unlike auth-rules.
 */

export const CODE_LENGTH = 6;

/** A whole code on its own, e.g. "Your code: 123456". */
const RUN = new RegExp(`(?<!\\d)\\d{${CODE_LENGTH}}(?!\\d)`);
/** A whole code with one space or hyphen between the digits, e.g. "1 2 3 4 5 6". */
const SPACED = new RegExp(`(?<!\\d)\\d(?:[\\s-]\\d){${CODE_LENGTH - 1}}(?!\\d)`);

/** Half-width digits only, at most CODE_LENGTH of them. NFKC turns full-width "１２３" into "123". */
export function cleanCode(text: string): string {
  return text.normalize("NFKC").replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/**
 * The full code in pasted text, or null when the text doesn't hold one. Finds it on its own, spaced out,
 * or grouped ("123 456"), and picks it out of a longer paste ("…code: 123456 … expire in 15 minutes").
 */
export function codeInPaste(text: string): string | null {
  const s = text.normalize("NFKC");
  const found = s.match(RUN) ?? s.match(SPACED);
  if (found) return found[0].replace(/\D/g, "");
  const digits = s.replace(/\D/g, "");
  return digits.length === CODE_LENGTH ? digits : null;
}
