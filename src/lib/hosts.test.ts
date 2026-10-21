import { describe, expect, it } from "vitest";
import { ADMIN_HOST, adminHostAllowed, isAdminPath, requestHostname } from "./hosts";

const h = (headers: Record<string, string>) => new Headers(headers);

describe("hosts", () => {
  it("reads the request's host from Vercel's forwarded header first, lowercased and without the port", () => {
    expect(requestHostname(h({ "x-forwarded-host": "Admin.AstroBakes.xyz", host: "internal" }))).toBe(ADMIN_HOST);
    expect(requestHostname(h({ "x-forwarded-host": "admin.astrobakes.xyz, proxy.test" }))).toBe(ADMIN_HOST);
    expect(requestHostname(h({ host: "localhost:3000" }))).toBe("localhost");
    expect(requestHostname(h({}))).toBe("");
  });

  it("pins the admin portal to its host in production, and lets previews and local dev use any host", () => {
    expect(adminHostAllowed(ADMIN_HOST, true)).toBe(true);
    expect(adminHostAllowed("astrobakes.xyz", true)).toBe(false);
    expect(adminHostAllowed("astro-bakes.vercel.app", true)).toBe(false);
    expect(adminHostAllowed("astro-bakes-git-feat-x-brendan-fs-projects.vercel.app", false)).toBe(true);
    expect(adminHostAllowed("localhost", false)).toBe(true);
  });

  it("knows which paths are the admin portal's", () => {
    for (const p of ["/admin", "/admin/", "/admin/sign-in", "/admin/auth/verify"]) expect(isAdminPath(p)).toBe(true);
    for (const p of ["/", "/en", "/administrator", "/admin-x", "/en/admin"]) expect(isAdminPath(p)).toBe(false);
  });
});
