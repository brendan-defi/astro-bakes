import { describe, expect, it } from "vitest";
import { formatTracking, parseTracking, trackingUrl } from "./tracking";

describe("tracking numbers (PRD 3.7, 4.6)", () => {
  it("reads a 12-digit number however it's typed or pasted", () => {
    for (const typed of ["123456789012", "1234-5678-9012", " 1234 5678 9012 ", "１２３４－５６７８－９０１２", "1234ー5678ー9012", "1234–5678–9012"]) {
      expect(parseTracking(typed), typed).toBe("123456789012");
    }
  });
  it("refuses anything that isn't 12 digits", () => {
    for (const typed of ["", "12345678901", "1234567890123", "1234-5678-901X", "EJ123456789JP", null, 123456789012]) {
      expect(parseTracking(typed), String(typed)).toBeNull();
    }
  });
  it("shows it as Japan Post prints it, and links to Japan Post's page for it in the customer's language", () => {
    expect(formatTracking("123456789012")).toBe("1234-5678-9012");
    expect(formatTracking("legacy-value")).toBe("legacy-value");
    expect(trackingUrl("123456789012", "ja")).toBe("https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=123456789012&searchKind=S002&locale=ja");
    expect(trackingUrl("123456789012", "en")).toMatch(/&locale=en$/);
  });
});
