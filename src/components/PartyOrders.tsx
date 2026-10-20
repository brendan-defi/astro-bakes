import Link from "next/link";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { CookieToy } from "./CookieToy";
import { StarShape, StarburstShape } from "./icons";
import s from "./home.module.css";

const ROWS = ["when", "howMany", "flavours"] as const;

/** "Want cookies at your next party?" (owner request): the way in to /custom-orders, shown in every drop state. */
export function PartyOrders({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  return (
    <section id="parties" className={s.parties} aria-labelledby="parties-h">
      <div className={`container ${s.partiesInner}`}>
        <div className={s.partiesText}>
          <span className={s.eyebrowSticker}>{t.partiesEyebrow}</span>
          <h2 id="parties-h" className="display h2">{t.partiesTitle}</h2>
          <p className={s.partiesBody}>{t.partiesBody}</p>
          <Link href={`/${locale}/custom-orders`} className={`btn btn-primary ${s.partiesBtn}`}>{t.partiesCta} →</Link>
          <p className={s.partiesFine}>{t.partiesFine}</p>
        </div>
        {/* A filled-in party order ticket: decoration that previews the form. */}
        <div className={s.partyVisual} aria-hidden>
          <div className={s.partyTicket}>
            <div className={s.partyTicketHead}>
              <StarShape className={s.partyStar} fill="var(--butter)" />
              <span>{t.ticketTitle}</span>
            </div>
            <div className={s.partyRows}>
              {ROWS.map((k) => (
                <div key={k} className={s.partyRow}>
                  <span className={s.partyKey}>{t.ticketRows[k]}</span>
                  <span className={s.partyValue}>{t.ticketExamples[k]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={s.partyBurst}>
            <StarburstShape />
            <span>{t.ticketBurst}</span>
          </div>
          {/* Tap either cookie for a shower of cookies. */}
          <CookieToy className={s.partyCookie} />
          <CookieToy className={s.partyCookie2} />
        </div>
      </div>
    </section>
  );
}
