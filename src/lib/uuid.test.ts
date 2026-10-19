import { describe, expect, it } from "vitest";
import { isUuid } from "./uuid";

describe("isUuid", () => {
  it("accepts real UUIDs in either case", () => {
    expect(isUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
    expect(isUuid("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe(true);
  });
  it("rejects anything that merely looks 36 characters long", () => {
    for (const bad of ["------------------------------------", "3f2504e04f8911d39a0c0305e82c3301", "3f2504e0-4f89-11d3-9a0c-0305e82c330", "", null, undefined, 42, "x".repeat(36)]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});
