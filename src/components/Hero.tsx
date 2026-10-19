import { drop, type Locale } from "@/lib/data";
import { fmtDate, fmtTime } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import { ArrowDownIcon, CookieShape, StarShape } from "./icons";
import s from "./home.module.css";

export function Hero({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  return (
    <section id="top" className={s.hero}>
      <div className={`container ${s.heroGrid}`}>
        <div className={s.heroText}>
          <div className={s.eyebrowSticker}>{drop.name}</div>
          <h1 className={`display h1 ${s.h1}`}>
            {t.heroTitleA}<span className={s.outlined}>{t.heroTitleB}</span>
          </h1>
          <p className={s.heroSub}>{t.heroSub}</p>
          <p className={s.heroTagline} lang="ja">{t.heroTagline}</p>
        </div>

        <div className={s.heroVisual}>
          <div className={s.astro}>
            <div className={s.astroMoon} />
            <svg viewBox="0 0 340 340" aria-hidden className={s.astroOrbit}>
              <path d="M4 216 C -34 150, 110 56, 250 50 C 344 46, 376 92, 334 140" fill="none" stroke="var(--ink)" strokeWidth="11" strokeLinecap="round" />
              <path d="M4 216 C -34 150, 110 56, 250 50 C 344 46, 376 92, 334 140" fill="none" stroke="var(--pink)" strokeWidth="6" strokeLinecap="round" />
            </svg>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/astro-cookie.jpg" alt={t.astroAlt} className={s.astroPhoto} />
            <svg viewBox="0 0 340 340" aria-hidden className={s.astroOrbit}>
              <path d="M334 198 C 300 264, 150 322, 60 294" fill="none" stroke="var(--ink)" strokeWidth="11" strokeLinecap="round" />
              <path d="M334 198 C 300 264, 150 322, 60 294" fill="none" stroke="var(--pink)" strokeWidth="6" strokeLinecap="round" />
            </svg>
            <CookieShape className={s.astroCookie} />
            <StarShape className={s.astroStar} />
            <StarShape className={s.astroStar2} fill="var(--white)" strokeWidth={3.5} />
            <div className={s.bubble}>{t.dropIsOpen(`Drop ${String(drop.number).padStart(2, "0")}`)}</div>
          </div>
        </div>

        <div className={s.heroActions}>
          <div className={s.tickets}>
            <div className={`${s.ticket} ${s.ticketPink}`}>
              <div className={`eyebrow ${s.eyebrow}`}>{t.ordersClose}</div>
              <div className={s.ticketValue}>{fmtDate(drop.closeAt, locale)}<br />{fmtTime(drop.closeAt, locale)}</div>
              <div className={s.ticketSub}>{t.orWhenSoldOut}</div>
            </div>
            <div className={`${s.ticket} ${s.ticketAqua}`}>
              <div className={`eyebrow ${s.eyebrow}`}>{t.arrives}</div>
              <div className={s.ticketValue}>{fmtDate(drop.arriveAt, locale)}<br />{t.atYourDoor}</div>
              <div className={s.ticketSub}>{t.ships} {fmtDate(drop.shipAt, locale)}</div>
            </div>
          </div>
          <a href="#boxes" className={`btn btn-primary ${s.heroCta}`}>
            {t.pickYourBoxes}
            <ArrowDownIcon />
          </a>
        </div>
      </div>
    </section>
  );
}
