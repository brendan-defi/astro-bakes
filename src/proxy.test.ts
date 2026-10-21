// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

/** A request as Vercel's edge hands it over: the Host header names the domain that was asked for. */
const req = (url: string, headers: Record<string, string> = {}) => new NextRequest(url, { headers: { host: new URL(url).host, ...headers } });

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends / to the browser's language (D2)", () => {
    expect(proxy(req("https://astrobakes.xyz/", { "accept-language": "ja-JP,ja;q=0.9" })).headers.get("location")).toBe("https://astrobakes.xyz/ja");
    expect(proxy(req("https://astrobakes.xyz/", { "accept-language": "en-GB" })).headers.get("location")).toBe("https://astrobakes.xyz/en");
  });

  it("serves /admin only on the admin host in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(proxy(req("https://astrobakes.xyz/admin")).status).toBe(404);
    expect(proxy(req("https://astrobakes.xyz/admin/sign-in")).status).toBe(404);
    expect(proxy(req("https://astro-bakes.vercel.app/admin/auth/verify?token=x")).status).toBe(404);
    expect(proxy(req("https://admin.astrobakes.xyz/admin")).headers.get("x-middleware-next")).toBe("1");
  });

  it("serves /admin on any host on previews and locally", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(proxy(req("https://astro-bakes-git-x.vercel.app/admin")).headers.get("x-middleware-next")).toBe("1");
    vi.stubEnv("VERCEL_ENV", "");
    expect(proxy(req("http://localhost:3000/admin/sign-in")).headers.get("x-middleware-next")).toBe("1");
  });
});
