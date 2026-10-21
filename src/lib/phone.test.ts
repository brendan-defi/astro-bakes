import { describe, expect, it } from "vitest";
import { cleanPhoneInput, normalisePhone } from "./phone";

describe("cleanPhoneInput", () => {
  it("drops letters and other symbols as they're typed", () => {
    expect(cleanPhoneInput("dsfasd")).toBe("");
    expect(cleanPhoneInput("090-12a34-5678")).toBe("090-1234-5678");
    expect(cleanPhoneInput("(03) 1234 5678")).toBe("0312345678");
  });

  it("turns a Japanese IME's full-width digits and dashes half-width", () => {
    expect(cleanPhoneInput("０９０ー１２３４－５６７８")).toBe("090-1234-5678");
    expect(cleanPhoneInput("090−1234‐5678")).toBe("090-1234-5678");
  });

  it("keeps a + only at the start, and one hyphen in a row", () => {
    expect(cleanPhoneInput("+81 90+1234--5678")).toBe("+81901234-5678");
  });
});

describe("normalisePhone", () => {
  it.each([
    ["090-1234-5678", "090-1234-5678"],
    ["09012345678", "09012345678"],
    ["050-1234-5678", "050-1234-5678"],
    ["03-1234-5678", "03-1234-5678"],
    ["045-123-4567", "045-123-4567"],
    ["0120-123-456", "0120-123-456"],
    ["０９０ー１２３４ー５６７８", "090-1234-5678"],
    [" 090-1234-5678- ", "090-1234-5678"],
    ["+81 90-1234-5678", "090-1234-5678"],
    ["+81-3-1234-5678", "03-1234-5678"],
    ["+81 (0)90 1234 5678", "09012345678"],
  ])("accepts %j as %j", (text, phone) => {
    expect(normalisePhone(text)).toBe(phone);
  });

  it.each([
    "",
    "dsfasd",
    "1",
    "090-1234-567", // a mobile missing a digit
    "03-1234-56789", // a landline with one too many
    "123-4567-8901",
    "0012345678",
    "+1 415 555 0100",
  ])("rejects %j", (text) => {
    expect(normalisePhone(text)).toBeNull();
  });
});
