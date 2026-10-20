import type { HomeData, Locale } from "@/lib/data";
import { daysUntil, fmtTickerDate, fmtTickerDateTime, fmtTickerDay } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import styles from "./Ticker.module.css";

/** Drop status ticker; copy per state from design-ref/DROP-STATES.md. */
export function Ticker({ locale, home }: { locale: Locale; home: HomeData }) {
  const t = getStrings(locale);
  const { state, drop, nextDrop } = home;
  let items: string[];
  let status: string;
  if (state === "open" && drop) {
    const days = daysUntil(drop.closeAt);
    const ship = fmtTickerDate(drop.shipAt, locale);
    items = [t.tickerOpen(drop.number), t.tickerCloses(days), t.tickerArea, t.tickerShips(ship)];
    status = t.tickerStatus(drop.number, days, ship);
  } else {
    if (state === "scheduled" && drop) {
      items = [t.tickerOpens(drop.number, fmtTickerDateTime(drop.openAt, locale)), t.tickerArea, t.tickerShips(fmtTickerDate(drop.shipAt, locale)), t.tickerNotified];
    } else if (state === "closed" && drop) {
      items = [t.tickerClosed(drop.number), t.tickerShips(fmtTickerDay(drop.shipAt, locale))];
      if (nextDrop) items.push(t.tickerNextDrop(fmtTickerDay(nextDrop.openAt, locale)));
      items.push(t.tickerArea);
    } else {
      items = [t.tickerBetween, t.tickerNextSoon, t.tickerArea, t.tickerNotified];
    }
    status = t.tickerSentence(items);
  }
  const Group = () => (
    <>
      {[0, 1].map((rep) =>
        items.map((it, i) => (
          <span key={`${rep}-${i}`} className={styles.item}>
            <span>{it}</span>
            <span className={i % 2 === 0 ? styles.pink : styles.aqua} aria-hidden>★</span>
          </span>
        )),
      )}
    </>
  );
  return (
    <div role="status" aria-label={status} className={styles.ticker}>
      <div aria-hidden className={styles.track}>
        <div className={styles.group}><Group /></div>
        <div className={styles.group}><Group /></div>
      </div>
    </div>
  );
}
