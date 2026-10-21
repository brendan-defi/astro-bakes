// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { unsubscribeHeaders, unsubscribeParams, unsubscribeUrls, verifyUnsubscribe } from "./unsubscribe";

const env = { secret: process.env.UNSUBSCRIBE_SECRET, vercel: process.env.VERCEL_ENV };
afterEach(() => {
  if (env.secret === undefined) delete process.env.UNSUBSCRIBE_SECRET; else process.env.UNSUBSCRIBE_SECRET = env.secret;
  if (env.vercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env.vercel;
});

describe("unsubscribe links", () => {
  it("verify for the address they were made for, normalised", () => {
    const p = unsubscribeParams("  Hanako@Example.COM ")!;
    expect(verifyUnsubscribe(p.e, p.t)).toBe("hanako@example.com");
  });

  it("don't verify when tampered with, swapped, or missing parts", () => {
    const a = unsubscribeParams("a@example.com")!;
    const b = unsubscribeParams("b@example.com")!;
    expect(verifyUnsubscribe(a.e, b.t)).toBeNull();
    expect(verifyUnsubscribe(a.e, a.t.slice(0, -1) + (a.t.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(verifyUnsubscribe(a.e, "")).toBeNull();
    expect(verifyUnsubscribe(undefined, a.t)).toBeNull();
    expect(verifyUnsubscribe(Buffer.from("not an email").toString("base64url"), a.t)).toBeNull();
  });

  it("depend on the secret, so a different secret invalidates them", () => {
    process.env.UNSUBSCRIBE_SECRET = "x".repeat(40);
    const p = unsubscribeParams("c@example.com")!;
    process.env.UNSUBSCRIBE_SECRET = "y".repeat(40);
    expect(verifyUnsubscribe(p.e, p.t)).toBeNull();
  });

  it("aren't made at all on Vercel without a proper secret", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.UNSUBSCRIBE_SECRET;
    expect(unsubscribeUrls("d@example.com", "en")).toBeNull();
    expect(unsubscribeHeaders("d@example.com", "en")).toEqual({});
    process.env.UNSUBSCRIBE_SECRET = "too-short";
    expect(unsubscribeUrls("d@example.com", "en")).toBeNull();
  });

  it("point the page at the locale and the header at the one-click endpoint (RFC 8058)", () => {
    const u = unsubscribeUrls("e@example.com", "ja")!;
    expect(new URL(u.page).pathname).toBe("/ja/unsubscribe");
    expect(new URL(u.oneClick).pathname).toBe("/api/unsubscribe");
    expect(new URL(u.oneClick).searchParams.get("l")).toBe("ja");
    expect(unsubscribeHeaders("e@example.com", "ja")).toEqual({ "List-Unsubscribe": `<${u.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });
});
