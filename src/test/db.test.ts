import { describe, expect, it } from "vitest";
import { assertLocal } from "./db";

describe("assertLocal", () => {
  it("accepts a local Postgres", () => {
    for (const url of ["postgres://postgres:postgres@localhost:5433/astro_test", "postgres://u:p@127.0.0.1/x", "postgres://u:p@[::1]:5432/x"]) {
      expect(() => assertLocal(url, false)).not.toThrow();
    }
  });

  it("accepts a Unix socket on this machine", () => {
    expect(() => assertLocal("postgres://u:p@/x?host=/var/run/postgresql", false)).not.toThrow();
  });

  it("checks the host the driver will use, not just the URL's hostname", () => {
    // node-postgres lets ?host= override the hostname, so this would reach remote.example.
    expect(() => assertLocal("postgres://u:p@localhost/throwaway?host=remote.example", false)).toThrow(/remote\.example/);
    // No host at all falls back to PGHOST, which could be anywhere.
    expect(() => assertLocal("postgres:///throwaway", false)).toThrow(/unnamed host/);
  });

  it("refuses a remote host, since the suites drop its schema, unless explicitly allowed", () => {
    const neon = "postgres://u:p@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
    expect(() => assertLocal(neon, false)).toThrow(/ep-cool-name-123456/);
    expect(() => assertLocal(neon, true)).not.toThrow();
  });
});
