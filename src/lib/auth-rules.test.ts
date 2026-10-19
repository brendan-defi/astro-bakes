import { describe, expect, it } from "vitest";
import { codeMatches, generateCode, generateToken, hashCode, hashSession, hashToken, normaliseEmail, safeNext } from "./auth-rules";

describe("auth rules", () => {
  it("generates six-digit codes with leading zeros and distinct URL-safe tokens", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    const a = generateToken(), b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes tokens, sessions and codes differently, and salts codes by token id", () => {
    expect(hashToken("x")).not.toBe(hashSession("x"));
    expect(hashCode("id-1", "123456")).not.toBe(hashCode("id-2", "123456"));
    expect(hashCode("id-1", "123456")).toBe(hashCode("id-1", "123456"));
  });

  it("compares codes in constant time and tolerates separators", () => {
    const h = hashCode("id-1", "042599");
    expect(codeMatches("id-1", "042599", h)).toBe(true);
    expect(codeMatches("id-1", "042 599", h)).toBe(true);
    expect(codeMatches("id-1", "042598", h)).toBe(false);
    expect(codeMatches("id-2", "042599", h)).toBe(false);
  });

  it("normalises emails and only allows same-site return paths", () => {
    expect(normaliseEmail("  You@Example.COM ")).toBe("you@example.com");
    expect(safeNext("/en/checkout?step=delivery", "/en")).toBe("/en/checkout?step=delivery");
    for (const bad of ["//evil.example", "https://evil.example", "/en\\\\x", "/en\nSet-Cookie:x", "", null, undefined]) expect(safeNext(bad as string, "/en")).toBe("/en");
  });
});
