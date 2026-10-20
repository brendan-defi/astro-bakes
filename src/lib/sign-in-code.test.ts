import { describe, expect, it } from "vitest";
import { cleanCode, codeInPaste } from "./sign-in-code";

describe("cleanCode", () => {
  it("keeps half-width digits, up to six", () => {
    expect(cleanCode("12a3 4-5")).toBe("12345");
    expect(cleanCode("12345678")).toBe("123456");
  });
  it("counts full-width digits from a Japanese IME", () => {
    expect(cleanCode("１２３４５６")).toBe("123456");
  });
});

describe("codeInPaste", () => {
  it.each([
    ["1 2 3 4 5 6", "123456"], // the email's old spaced-out look
    ["123456", "123456"],
    [" 123456\n", "123456"],
    ["123 456", "123456"],
    ["123-456", "123456"],
    ["１２３４５６", "123456"],
    ["１２３　４５６", "123456"], // full-width space
    ["Your Astro Bakes sign-in code: 482913", "482913"],
    ["Your code: 482913\n\nThe link and code expire in 15 minutes", "482913"],
    ["コード: 482913\n\nリンクとコードは 15 分で無効になります。", "482913"],
    ["Your code\n\n4 8 2 9 1 3\n\nexpire in 15 minutes", "482913"],
  ])("finds the code in %j", (text, code) => {
    expect(codeInPaste(text)).toBe(code);
  });

  it.each(["123", "12 34", "1234567", "", "expire in 15 minutes"])("finds no whole code in %j", (text) => {
    expect(codeInPaste(text)).toBeNull();
  });
});
