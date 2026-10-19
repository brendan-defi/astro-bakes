import { drop } from "@/lib/data";
import { daysUntil, fmtTickerDate } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import type { Locale } from "@/lib/data";
import styles from "./Ticker.module.css";

export function Ticker({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  const days = daysUntil(drop.closeAt);
  const ship = fmtTickerDate(drop.shipAt);
  const items = [t.tickerOpen(drop.number), t.tickerCloses(days), t.tickerArea, t.tickerShips(ship)];
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
    <div role="status" aria-label={t.tickerStatus(drop.number, days, fmtTickerDate(drop.shipAt))} className={styles.ticker}>
      <div aria-hidden className={styles.track}>
        <div className={styles.group}><Group /></div>
        <div className={styles.group}><Group /></div>
      </div>
    </div>
  );
}
