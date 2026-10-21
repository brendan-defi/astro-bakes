// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ unsubscribe: vi.fn() }));
vi.mock("@/lib/unsubscribe", async (original) => ({ ...(await original<typeof import("@/lib/unsubscribe")>()), unsubscribe: calls.unsubscribe }));
import { unsubscribeUrls } from "@/lib/unsubscribe";
import { GET, POST } from "./route";

beforeEach(() => { calls.unsubscribe.mockReset().mockResolvedValue({ subscriber: true, customer: false }); });

describe("one-click unsubscribe endpoint (RFC 8058)", () => {
  it("unsubscribes on the mail client's POST, with no cookies needed", async () => {
    const url = unsubscribeUrls("Someone@Example.com", "en")!.oneClick;
    const res = await POST(new Request(url, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } }));
    expect(res.status).toBe(200);
    expect(calls.unsubscribe).toHaveBeenCalledWith("someone@example.com");
  });

  it("refuses a link that doesn't verify", async () => {
    const url = new URL(unsubscribeUrls("a@example.com", "en")!.oneClick);
    url.searchParams.set("t", "forged");
    const res = await POST(new Request(url, { method: "POST" }));
    expect(res.status).toBe(400);
    expect(calls.unsubscribe).not.toHaveBeenCalled();
  });

  it("sends a browser GET to the confirm page in the right language, changing nothing", async () => {
    const url = unsubscribeUrls("b@example.com", "ja")!.oneClick;
    const res = await GET(new Request(url));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/ja/unsubscribe");
    expect(to.searchParams.get("e")).toBeTruthy();
    expect(to.searchParams.get("t")).toBeTruthy();
    expect(calls.unsubscribe).not.toHaveBeenCalled();
  });
});
