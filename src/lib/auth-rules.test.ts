import { describe, expect, it } from "vitest";
import { adminNext, codeMatches, flowMatches, generateCode, generateToken, hashCode, hashFlow, hashSession, hashToken, isSameOriginRequest, maskEmail, normaliseEmail, safeNext, signInDestination } from "./auth-rules";

describe("auth rules", () => {
  it("generates six-digit codes with leading zeros and distinct URL-safe tokens", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    const a = generateToken(), b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes tokens, sessions, flows and codes differently, and salts codes by token id", () => {
    expect(new Set([hashToken("x"), hashSession("x"), hashFlow("x")]).size).toBe(3);
    expect(hashCode("id-1", "123456")).not.toBe(hashCode("id-2", "123456"));
    expect(hashCode("id-1", "123456")).toBe(hashCode("id-1", "123456"));
  });

  it("compares codes and flow secrets in constant time and tolerates separators in codes", () => {
    const h = hashCode("id-1", "042599");
    expect(codeMatches("id-1", "042599", h)).toBe(true);
    expect(codeMatches("id-1", "042 599", h)).toBe(true);
    expect(codeMatches("id-1", "042598", h)).toBe(false);
    expect(codeMatches("id-2", "042599", h)).toBe(false);
    const f = hashFlow("secret");
    expect(flowMatches("secret", f)).toBe(true);
    expect(flowMatches("other", f)).toBe(false);
    expect(flowMatches(null, f)).toBe(false);
    expect(flowMatches("", f)).toBe(false);
  });

  it("normalises emails and masks them for display", () => {
    expect(normaliseEmail("  You@Example.COM ")).toBe("you@example.com");
    expect(maskEmail("jane.doe@example.com")).toBe("j***@example.com");
    expect(maskEmail("a@b.c")).toBe("a***@b.c");
    expect(maskEmail("broken")).toBe("***");
  });

  it("only allows same-site return paths, rejecting hosts, schemes and every control character", () => {
    expect(safeNext("/en/checkout?step=delivery&r=abc:1", "/en")).toBe("/en/checkout?step=delivery&r=abc:1");
    expect(safeNext("/en#boxes", "/en")).toBe("/en#boxes");
    for (const bad of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "/en\\x",
      "/en\nSet-Cookie:x",
      "/\t/attacker.test/path", // a tab that URL parsing would strip, leaving //attacker.test
      "/\u0000/x",
      "/\u007f/x",
      "/en\r",
      "",
      null,
      undefined,
    ]) {
      expect(safeNext(bad as string, "/en")).toBe("/en");
    }
    // the chosen path must stay on the dummy origin once resolved
    expect(new URL(safeNext("/\t/attacker.test/path", "/en"), "https://astrobakes.xyz").origin).toBe("https://astrobakes.xyz");
  });

  it("rejects paths whose dot-segment normalisation would become protocol-relative", () => {
    for (const bad of [
      "/safe/..//attacker.test/path", // the reported case: normalises to //attacker.test/path
      "/a/../..//evil.example",
      "/./..//evil.example",
      "/en/..//evil.example/x",
      "/%2e%2e//evil.example", // percent-encoded dots normalise the same way
      "/a/b/../../..//evil.example",
    ]) {
      const out = safeNext(bad, "/en");
      expect(out).toBe("/en");
      expect(new URL(out, "https://astrobakes.xyz").origin).toBe("https://astrobakes.xyz");
    }
    // ordinary dot segments are fine and come back normalised
    expect(safeNext("/en/a/../checkout?step=delivery", "/en")).toBe("/en/checkout?step=delivery");
    expect(safeNext("/en//double", "/en")).toBe("/en//double"); // a double slash inside the path is still same-site
  });

  it("the authenticated sign-in redirect never leaves the site", () => {
    const attacks = ["/safe/..//attacker.test/path", "//attacker.test", "https://attacker.test", "/\t/attacker.test/path", "/%2e%2e//attacker.test"];
    for (const a of attacks) {
      const dest = signInDestination(a, "en");
      expect(dest).toBe("/en/account");
      expect(new URL(dest, "https://astrobakes.xyz").origin).toBe("https://astrobakes.xyz");
    }
    expect(signInDestination("/en/checkout?step=delivery&r=x", "en")).toBe("/en/checkout?step=delivery&r=x");
    expect(signInDestination(null, "ja")).toBe("/ja/account");
  });

  it("recognises same-origin requests for the confirmation POST", () => {
    expect(isSameOriginRequest({ secFetchSite: "same-origin" })).toBe(true);
    expect(isSameOriginRequest({ secFetchSite: "none" })).toBe(true); // typed by the user
    expect(isSameOriginRequest({ secFetchSite: "cross-site", origin: "https://astrobakes.xyz", host: "astrobakes.xyz" })).toBe(false);
    expect(isSameOriginRequest({ origin: "https://astrobakes.xyz", host: "astrobakes.xyz" })).toBe(true);
    expect(isSameOriginRequest({ origin: "https://astrobakes.xyz", forwardedHost: "astrobakes.xyz", host: "internal:3000" })).toBe(true);
    expect(isSameOriginRequest({ origin: "https://evil.example", host: "astrobakes.xyz" })).toBe(false);
    expect(isSameOriginRequest({ origin: "null", host: "astrobakes.xyz" })).toBe(false);
    expect(isSameOriginRequest({})).toBe(false);
  });
  it("keeps an admin sign-in's return path inside /admin", () => {
    expect(adminNext("/admin/orders?state=paid")).toBe("/admin/orders?state=paid");
    expect(adminNext("/admin")).toBe("/admin");
    for (const bad of [null, "", "/en/account", "/administrator", "/admin-evil", "//admin.astrobakes.xyz/admin", "https://evil.test/admin", "/admin/../en"]) {
      expect(adminNext(bad)).toBe("/admin");
    }
  });
});
