import { vi } from "vitest";

/**
 * TEST_CLOCK=<ISO date-time> runs the whole suite as if it were then. Only Date is faked (timers stay real), so a
 * test that leans on the calendar instead of on dates derived from its fixtures fails now rather than on the day
 * the calendar catches up with it. The seeded drops are pinned relative to the clock by reseed() in db.ts, so the
 * suites pass on any date:
 *
 *   TEST_CLOCK=2027-03-01T03:00:00Z TEST_DATABASE_URL=… pnpm test
 *
 * Two exceptions, by design: Postgres stamps rows with its own now(), so the sign-in rate-limit and subscriber
 * welcome suites, which compare JS time with those stamps, read wrongly under a faked clock.
 */
if (process.env.TEST_CLOCK) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(process.env.TEST_CLOCK));
}
