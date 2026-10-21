/**
 * The recipient's phone number, which Japan Post prints on the label (PRD 2.3). We only deliver in
 * Tokyo (D20), so it's a Japanese number, entered however people write one: hyphenated or not,
 * full-width through a Japanese IME (where the hyphen key types ー), or as +81. Client-safe.
 */

/** Every dash a phone number turns up with: IME long-vowel mark, hyphens, minus signs, en and em dashes. */
export const DASHES = /[ー‐‑‒–—―−ｰ]/g;

/** What the field keeps as you type: half-width digits, hyphens, and a + at the start. Everything else is dropped. */
export function cleanPhoneInput(text: string): string {
  return text
    .normalize("NFKC")
    .replace(DASHES, "-")
    .replace(/[^\d+-]/g, "")
    .replace(/(?!^)\+/g, "")
    .replace(/-{2,}/g, "-");
}

/** 070/080/090 mobiles, 050 IP phones, 020 and 0800 numbers have 11 digits; everything else has 10. */
const JAPANESE_NUMBER = /^(?:0[25789]0\d{8}|0(?![25789]0)[1-9]\d{8})$/;

/**
 * The number to store and print: half-width digits with the customer's own hyphens, and +81 turned
 * back into the leading 0. Null when it isn't a Japanese number, including a mobile missing a digit.
 */
export function normalisePhone(text: string): string | null {
  let n = cleanPhoneInput(text).replace(/^-+|-+$/g, "");
  if (n.startsWith("+")) {
    if (!n.startsWith("+81")) return null;
    n = n.slice(3).replace(/^-/, "");
    if (!n.startsWith("0")) n = `0${n}`;
  }
  return JAPANESE_NUMBER.test(n.replace(/-/g, "")) ? n : null;
}
