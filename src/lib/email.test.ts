// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** The real Resend transport, with the SDK replaced: what it's asked to send, and what happens at the deadline. */
const sdk = vi.hoisted(() => ({
  calls: [] as { payload: Record<string, unknown>; options: { idempotencyKey?: string; signal?: AbortSignal } }[],
  hang: false,
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: (payload: Record<string, unknown>, options: { idempotencyKey?: string; signal?: AbortSignal }) => {
        sdk.calls.push({ payload, options });
        if (!sdk.hang) return Promise.resolve({ data: { id: "re_123" }, error: null });
        // Like fetch: a hung request only ends when its signal aborts.
        return new Promise((_, reject) => options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true }));
      },
    };
  },
}));
vi.mock("@/db", () => ({ getDb: () => ({ insert: () => ({ values: async () => {} }) }) }));
vi.mock("@/lib/settings", () => ({ contactEmail: async () => "hello@astrobakes.xyz" }));
import { sendEmail, setEmailSendTimeout, setEmailTransport } from "./email";

const email = { to: "you@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi", type: "welcome", idempotencyKey: "welcome/x/1", headers: { "List-Unsubscribe": "<https://astrobakes.xyz/api/unsubscribe?e=a&t=b>" } };
const savedKey = process.env.RESEND_API_KEY;

beforeAll(() => { process.env.RESEND_API_KEY = "re_test_key"; setEmailTransport(null); });
afterAll(() => { if (savedKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = savedKey; setEmailSendTimeout(null); });
// Block bodies on purpose: a returned value would be run as a vitest cleanup after each test.
beforeEach(() => { sdk.calls.length = 0; sdk.hang = false; setEmailSendTimeout(null); });

describe("sendEmail through Resend", () => {
  it("passes the headers, the idempotency key and a live abort signal to the SDK", async () => {
    expect(await sendEmail(email)).toEqual({ ok: true, providerMessageId: "re_123" });
    const { payload, options } = sdk.calls[0];
    expect(payload.headers).toEqual(email.headers);
    expect(options.idempotencyKey).toBe("welcome/x/1");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal?.aborted).toBe(false);
  });

  it("aborts the request itself when the deadline passes, and reports a timeout", async () => {
    setEmailSendTimeout(50);
    sdk.hang = true;
    const outcome = await sendEmail(email);
    expect(outcome).toMatchObject({ ok: false, error: expect.stringMatching(/timed out after 50 ms and aborted/) });
    expect(sdk.calls[0].options.signal?.aborted).toBe(true);
  });
});
