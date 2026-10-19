import type { Locale } from "./data";

/** "¥1,500" or the placeholder when the value isn't known yet. */
export function yen(n: number | null | undefined, placeholder = "¥[price]"): string {
  if (n == null) return placeholder;
  return "¥" + n.toLocaleString("en-US");
}

const TZ = "Asia/Tokyo";

/** "Sun, Oct 18" / 「10月18日(日)」 — always JST with the weekday (PRD 5.6). */
export function fmtDate(d: Date, locale: Locale = "en"): string {
  if (locale === "ja") {
    const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "numeric", day: "numeric", weekday: "short" }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("month")}月${get("day")}日(${get("weekday")})`;
  }
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(d);
}

/** "21:00 JST" */
export function fmtTime(d: Date, locale: Locale = "en"): string {
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return locale === "ja" ? t : `${t} JST`;
}

/** "Sun, Oct 18 · 21:00 JST" */
export function fmtDateTime(d: Date, locale: Locale = "en"): string {
  return `${fmtDate(d, locale)} · ${fmtTime(d, locale)}`;
}

/** "OCT 25" for the ticker */
export function fmtTickerDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(d).toUpperCase();
}

/** Whole days until `d`, floored at 0. */
export function daysUntil(d: Date, now = new Date()): number {
  return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
}

/** "9:52" */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** "SUN OCT 25" for the ticker */
export function fmtTickerDay(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })
    .format(d)
    .replace(",", "")
    .toUpperCase();
}

/** "SUN NOV 8, 10:00 JST" for the ticker */
export function fmtTickerDateTime(d: Date): string {
  return `${fmtTickerDay(d)}, ${fmtTime(d)}`;
}

/** "Sunday" / 「日曜日」 */
export function fmtWeekday(d: Date, locale: Locale = "en"): string {
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", { timeZone: TZ, weekday: "long" }).format(d);
}

/** "10" or "10:30" — for the speech bubble */
export function fmtHourShort(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = String(Number(parts.find((p) => p.type === "hour")?.value ?? "0"));
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return m === "00" ? h : `${h}:${m}`;
}

/** Days and hours until `d`, floored at 0 (PRD 1.1: no seconds). */
export function daysHoursUntil(d: Date, now = new Date()): { days: number; hours: number } {
  const ms = Math.max(0, d.getTime() - now.getTime());
  return { days: Math.floor(ms / 86_400_000), hours: Math.floor((ms % 86_400_000) / 3_600_000) };
}
