import type { Drop, HomeData, Locale } from "@/lib/data";
import { daysHoursUntil, fmtDate, fmtDateTime, fmtHourShort, fmtTime, fmtWeekday, yen } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import { ArrowDownIcon, TruckIcon } from "./icons";
import { HeroAstro } from "./HeroAstro";
import { ScrollLink } from "./ScrollLink";
import { Countdown } from "./Countdown";
import { NotifyForm } from "./NotifyForm";
import { SignedInDropEmails } from "./SignedInDropEmails";
import s from "./home.module.css";

/** Drop hero: one of four variants from the drop state (PRD 1.1). */
export function Hero({ locale, home }: { locale: Locale; home: HomeData }) {
  if (home.state === "open" && home.drop) return <HeroOpen locale={locale} drop={home.drop} soldOut={home.soldOut} />;
  return <HeroNotOpen locale={locale} home={home} />;
}

/** The open hero; sold out (D9) keeps it, with the bubble, the closing ticket and the call to action saying so. */
function HeroOpen({ locale, drop, soldOut }: { locale: Locale; drop: Drop; soldOut: boolean }) {
  const t = getStrings(locale);
  return (
    <section id="top" className={s.hero}>
      <div className={`container ${s.heroGrid}`}>
        <div className={s.heroText}>
          <div className={s.eyebrowSticker}>{drop.name}</div>
          {drop.description && <p className={s.dropNote}>{drop.description}</p>}
          <Title t={t} />
        </div>

        <HeroAstro photo="/images/astro-cookie.jpg" alt={t.astroAlt} bubble={soldOut ? t.dropSoldOut(t.dropN(drop.number)) : t.dropIsOpen(t.dropN(drop.number))} />

        <div className={s.heroActions}>
          <div className={s.tickets}>
            <div className={`${s.ticket} ${s.ticketPink}`}>
              <div className={`eyebrow ${s.eyebrow}`}>{t.ordersClose}</div>
              <div className={s.ticketValue}>{fmtDate(drop.closeAt, locale)}<br />{fmtTime(drop.closeAt, locale)}</div>
              <div className={s.ticketSub}>{soldOut ? t.everyBoxSoldOut : t.orWhenSoldOut}</div>
            </div>
            <div className={`${s.ticket} ${s.ticketAqua}`}>
              <div className={`eyebrow ${s.eyebrow}`}>{t.arrives}</div>
              <div className={s.ticketValue}>{fmtDate(drop.arriveAt, locale)}<br />{t.atYourDoor}</div>
              <div className={s.ticketSub}>{t.ships} {fmtDate(drop.shipAt, locale)}</div>
            </div>
          </div>
          {soldOut ? (
            <ScrollLink href="#notify" className={`btn btn-primary ${s.heroCta}`}>
              {t.headsUpNextDrop}
              <ArrowDownIcon />
            </ScrollLink>
          ) : (
            <ScrollLink href="#boxes" className={`btn btn-primary sheen ${s.heroCta}`}>
              {t.pickYourBoxes}
              <ArrowDownIcon />
            </ScrollLink>
          )}
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
          {(state === "scheduled" || state === "closed") && drop?.description && <p className={s.dropNote}>{drop.description}</p>}
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
                  <div className={s.ticketSub}>{settings.shippingFee === 0 ? t.boxesShippingIncluded(drop.boxes.length) : t.boxesAndShipping(drop.boxes.length, yen(settings.shippingFee, "¥[fee]"))}</div>
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
            <a href={`/${locale}/account/orders/${encodeURIComponent(order.number)}`} className={s.orderCard}>
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

          {viewer.signedIn ? (
            // Signed-in viewers see their notification preference, not an email field (PRD 1.5 / 2.4):
            // a status with a link to the account page's toggle, so nobody unsubscribes from the homepage by accident.
            <SignedInDropEmails
              locale={locale}
              variant="hero"
              optedIn={viewer.optedIn}
              statusText={upcoming ? t.onListFor(t.dropN(upcoming.number)) : t.onListGeneric}
              label={upcoming ? t.optInNext(t.dropN(upcoming.number)) : t.optInGeneric}
              consent={t.dropEmailsOnly}
            />
          ) : (
            <NotifyForm
              locale={locale}
              id="hero-email"
              variant="hero"
              label={formLabel}
              button={state === "scheduled" ? t.remindMe : t.notifyMe}
              consent={t.dropEmailsOnly}
              extra={<ScrollLink href="#notify">{t.orLine}</ScrollLink>}
            />
          )}
        </div>

        <HeroAstro photo={photo} alt={alt} bubble={bubble} />
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
