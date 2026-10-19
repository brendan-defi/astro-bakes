import type { Drop, HomeData, Locale } from "@/lib/data";
import { daysHoursUntil, fmtDate, fmtDateTime, fmtHourShort, fmtTime, fmtWeekday, yen } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import { ArrowDownIcon, CookieShape, StarShape, TruckIcon } from "./icons";
import { Countdown } from "./Countdown";
import { NotifyForm } from "./NotifyForm";
import s from "./home.module.css";

/** Drop hero: one of four variants from the drop state (PRD 1.1). */
export function Hero({ locale, home }: { locale: Locale; home: HomeData }) {
  if (home.state === "open" && home.drop) return <HeroOpen locale={locale} drop={home.drop} />;
  return <HeroNotOpen locale={locale} home={home} />;
}

function HeroOpen({ locale, drop }: { locale: Locale; drop: Drop }) {
  const t = getStrings(locale);
  return (
    <section id="top" className={s.hero}>
      <div className={`container ${s.heroGrid}`}>
        <div className={s.heroText}>
          <div className={s.eyebrowSticker}>{drop.name}</div>
          <Title t={t} />
        </div>

        <AstroVisual photo="/images/astro-cookie.jpg" alt={t.astroAlt} bubble={t.dropIsOpen(t.dropN(drop.number))} />

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

/** Scheduled, closed and no-drop variants (design-ref/DROP-STATES.md). */
function HeroNotOpen({ locale, home }: { locale: Locale; home: HomeData }) {
  const t = getStrings(locale);
  const { state, drop, nextDrop, viewer, settings } = home;
  // The drop the notify copy refers to: the scheduled one, or the next one after a closed drop.
  const upcoming = state === "scheduled" ? drop : nextDrop;
  const order = state === "closed" && drop && viewer.signedIn && viewer.order?.dropId === drop.id ? viewer.order : null;
  const onList = viewer.signedIn && viewer.optedIn;

  let eyebrow: string, eyebrowClass = "", bubble: string, photo = "/images/astro-cookie.jpg", alt = t.astroAlt;
  if (state === "scheduled" && drop) {
    eyebrow = drop.name;
    bubble = t.bubbleScheduled(fmtWeekday(drop.openAt, locale), fmtHourShort(drop.openAt));
  } else if (state === "closed" && drop) {
    eyebrow = t.eyebrowClosed(t.dropN(drop.number));
    eyebrowClass = s.eyebrowWhite;
    bubble = t.bubbleClosed;
  } else {
    eyebrow = t.betweenDrops;
    eyebrowClass = s.eyebrowAqua;
    bubble = t.bubbleNodrop;
    photo = "/images/astro-outside.jpg";
    alt = t.astroOutsideAlt;
  }
  const formLabel = state === "scheduled" && drop ? t.remindLabel(t.dropN(drop.number)) : upcoming ? t.notifyLabelNext(t.dropN(upcoming.number)) : t.notifyLabelNodrop;

  return (
    <section id="top" className={s.hero}>
      <div className={`container ${s.heroGrid} ${s.heroStates}`}>
        <div className={s.heroText}>
          <div className={`${s.eyebrowSticker} ${eyebrowClass}`}>{eyebrow}</div>
          <Title t={t} />

          {state === "scheduled" && drop && (
            <div className={s.detail}>
              <div className={s.countdown}>
                <div className={`eyebrow ${s.countLabel}`}>{t.opensIn(t.dropN(drop.number))}</div>
                <Countdown openAt={drop.openAt.getTime()} initial={daysHoursUntil(drop.openAt)} labels={{ days: t.days, hours: t.hours }} />
              </div>
              <div className={s.tickets}>
                <div className={`${s.ticket} ${s.ticketPink}`}>
                  <div className={`eyebrow ${s.eyebrow}`}>{t.ordersOpen}</div>
                  <div className={s.ticketValue}>{fmtDateTime(drop.openAt, locale)}</div>
                  <div className={s.ticketSub}>{t.boxesAndShipping(drop.boxes.length, yen(settings.shippingFee, "¥[fee]"))}</div>
                </div>
                <div className={`${s.ticket} ${s.ticketAqua}`}>
                  <div className={`eyebrow ${s.eyebrow}`}>{t.arrives}</div>
                  <div className={s.ticketValue}>{fmtDate(drop.arriveAt, locale)}</div>
                  <div className={s.ticketSub}>{t.ships} {fmtDate(drop.shipAt, locale)}</div>
                </div>
              </div>
            </div>
          )}

          {state === "closed" && drop && (
            <div className={s.tickets}>
              <div className={`${s.ticket} ${s.ticketWhite}`}>
                <div className={`eyebrow ${s.eyebrow}`}>{t.dropClosed(t.dropN(drop.number))}</div>
                <div className={s.ticketValue}>{t.everyOrderShips(fmtDate(drop.shipAt, locale))}</div>
                <div className={s.ticketSub}>{t.thanksOrdered}</div>
              </div>
              {nextDrop && (
                <div className={`${s.ticket} ${s.ticketButter}`}>
                  <div className={`eyebrow ${s.eyebrow}`}>{t.nextDrop}</div>
                  <div className={s.ticketValue}>{fmtDateTime(nextDrop.openAt, locale)}</div>
                  <div className={s.ticketSub}>{nextDrop.name}</div>
                </div>
              )}
            </div>
          )}

          {order && drop && (
            // TODO: link to the order page (PRD 2.5) once it exists
            <a href="#top" className={s.orderCard}>
              <span className={s.orderIcon}><TruckIcon /></span>
              <span className={s.orderBody}>
                <span className={s.orderMain}>{t.yourBoxesShip(order.boxCount, fmtDate(drop.shipAt, locale))}</span>
                <span className={s.orderSub}>{t.arrivingOrder(fmtDate(drop.arriveAt, locale), order.number)}</span>
              </span>
              <span className={s.orderView}>{t.view}</span>
            </a>
          )}

          {state === "nodrop" && (
            <div className={s.betweenCard}>
              <div className={`eyebrow ${s.eyebrow}`}>{t.betweenDrops}</div>
              <div className={s.betweenBody}>{t.betweenBody}</div>
            </div>
          )}

          {onList ? (
            // Signed-in viewers see their notification preference, not an email field (PRD 1.5 / 2.4).
            // TODO: persist to Customer.marketing_opt_in
            <label className={s.onList}>
              <input type="checkbox" defaultChecked />
              {upcoming ? t.onListFor(t.dropN(upcoming.number)) : t.onListGeneric}
            </label>
          ) : (
            <NotifyForm
              locale={locale}
              id="hero-email"
              variant="hero"
              label={formLabel}
              button={state === "scheduled" ? t.remindMe : t.notifyMe}
              consent={t.dropEmailsOnly}
              extra={<a href="#notify">{t.orLine}</a>}
            />
          )}
        </div>

        <AstroVisual photo={photo} alt={alt} bubble={bubble} />
      </div>
    </section>
  );
}

function Title({ t }: { t: ReturnType<typeof getStrings> }) {
  return (
    <>
      <h1 className={`display h1 ${s.h1}`}>
        {t.heroTitleA}<span className={s.outlined}>{t.heroTitleB}</span>
      </h1>
      <p className={s.heroSub}>{t.heroSub}</p>
      <p className={s.heroTagline} lang="ja">{t.heroTagline}</p>
    </>
  );
}

function AstroVisual({ photo, alt, bubble }: { photo: string; alt: string; bubble: string }) {
  return (
    <div className={s.heroVisual}>
      <div className={s.astro}>
        <div className={s.astroMoon} />
        <svg viewBox="0 0 340 340" aria-hidden className={s.astroOrbit}>
          <path d="M4 216 C -34 150, 110 56, 250 50 C 344 46, 376 92, 334 140" fill="none" stroke="var(--ink)" strokeWidth="11" strokeLinecap="round" />
          <path d="M4 216 C -34 150, 110 56, 250 50 C 344 46, 376 92, 334 140" fill="none" stroke="var(--pink)" strokeWidth="6" strokeLinecap="round" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt={alt} className={s.astroPhoto} />
        <svg viewBox="0 0 340 340" aria-hidden className={s.astroOrbit}>
          <path d="M334 198 C 300 264, 150 322, 60 294" fill="none" stroke="var(--ink)" strokeWidth="11" strokeLinecap="round" />
          <path d="M334 198 C 300 264, 150 322, 60 294" fill="none" stroke="var(--pink)" strokeWidth="6" strokeLinecap="round" />
        </svg>
        <CookieShape className={s.astroCookie} />
        <StarShape className={s.astroStar} />
        <StarShape className={s.astroStar2} fill="var(--white)" strokeWidth={3.5} />
        <div className={s.bubble}>{bubble}</div>
      </div>
    </div>
  );
}
