import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentCustomer } from "@/lib/auth";
import { loadOrder } from "@/lib/account";
import { cartIdFromCookie } from "@/lib/cart-cookie";
import { settings as defaultSettings } from "@/lib/data";
import { fmtDate, fmtDateTime, yen } from "@/lib/format";
import { loadSettings } from "@/lib/drops";
import { getStrings, isLocale, jaLang } from "@/lib/i18n";
import { privatePage, stringsFor } from "@/lib/metadata";
import { formatTracking, trackingUrl } from "@/lib/tracking";
import { Logo } from "@/components/Logo";
import { ArrowLeftIcon, TruckIcon } from "@/components/icons";
import { CancelOrderButton, ReorderButton } from "@/components/account/OrderButtons";
import { StatusPill } from "@/components/account/StatusPill";
import { TimeSlotPicker } from "@/components/account/TimeSlotPicker";
import s from "@/components/checkout.module.css";
import a from "@/components/account.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; number: string }> }): Promise<Metadata> {
  const { locale, number } = await params;
  return privatePage(stringsFor(locale).orderPageTitle(number));
}

/** One order (PRD 2.5): items, address, dates, gift message, payment, tracking, cancel while open, order again. */
export default async function OrderPage({ params }: { params: Promise<{ locale: string; number: string }> }) {
  const { locale, number } = await params;
  if (!isLocale(locale)) notFound();
  const me = await currentCustomer();
  if (!me) redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/account/orders/${number}`)}`);
  const [order, settings] = await Promise.all([loadOrder(me.id, number, locale, await cartIdFromCookie()), loadSettings().catch(() => defaultSettings)]);
  if (!order) notFound();
  const t = getStrings(locale);
  const home = `/${locale}`;
  const live = order.status !== "cancelled" && order.status !== "expired";
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={`container ${s.headerRow}`}>
          <Link href={`${home}/account`} aria-label={t.back} className={s.iconBtn}><ArrowLeftIcon /></Link>
          <Logo href={home} label={t.home} size="sm" />
          <span className={s.spacer} />
          <Link href={`${home}/account`} className={s.headerLink}>{t.accountTitle}</Link>
        </div>
      </header>
      <div className={s.body}>
        <main className={s.main}>
          <div className={a.wrap}>
            <div className="stack" style={{ gap: 8 }}>
              <div className={a.cardTop}>
                <h1 className={`display ${s.h1sm}`}>{order.number}</h1>
                <StatusPill locale={locale} status={order.status} />
              </div>
              <p className={s.lead15}>{order.dropName} · {t.placedOn(fmtDate(order.placedAt, locale))}</p>
            </div>

            <section className={a.card} aria-label={t.yourOrder}>
              <div className={a.lines}>
                {order.lines.map((l) => <div key={l.slug} className={a.line}><span>{l.name} × {l.qty} <span className={s.sub12}>({yen(l.unitPrice)} {t.each})</span></span><span>{yen(l.lineTotal)}</span></div>)}
                <div className={a.line} style={{ borderTop: "2px dashed var(--ink)", paddingTop: 8, marginTop: 4 }}><span>{t.subtotal}</span><span>{yen(order.subtotal)}</span></div>
                {order.shippingFee > 0 && <div className={a.line}><span>{t.shipping}</span><span>{yen(order.shippingFee)}</span></div>}
                <div className={a.line} style={{ fontWeight: 900 }}><span>{t.total} <span className={s.sub12} lang={jaLang(locale)}>{t.taxIncl}</span></span><span>{yen(order.total)}</span></div>
              </div>
            </section>

            <section className={a.card} aria-label={t.deliverTo}>
              <dl className={a.dl}>
                <dt>{t.deliverTo}</dt><dd>{order.shipToName}<br />{order.addressLine}<br />{order.phone}</dd>
                {order.giftMessage && <><dt>{t.giftCard}</dt><dd>{order.giftMessage}</dd></>}
                {live && !order.canChangeSlot && <><dt>{t.slotTitle}</dt><dd>{t.deliverySlots[order.timeSlot]}</dd></>}
                <dt>{t.payWith}</dt><dd>{order.paymentMethod === "paypay" ? t.paypay : t.card}</dd>
                {order.trackingNumber && <><dt>{t.tracking}</dt><dd><a href={trackingUrl(order.trackingNumber, locale)} target="_blank" rel="noreferrer">{formatTracking(order.trackingNumber)}</a></dd></>}
                {order.refund && <><dt>{t.refund}</dt><dd>{yen(order.refund.amount)} · {order.refund.issued ? t.refundIssued : t.refundPending}</dd></>}
              </dl>
              {live && <div className={s.shipLine}><TruckIcon size={20} />{t.shipsByPostSlot(fmtDate(order.shipAt, locale), fmtDate(order.arriveAt, locale), t.deliverySlots[order.timeSlot])}</div>}
            </section>

            {order.canChangeSlot && (
              <section className={a.card} aria-label={t.slotTitle}>
                <TimeSlotPicker locale={locale} number={order.number} initial={order.timeSlot} legend={t.slotLegend(fmtDate(order.arriveAt, locale))} />
                <span className={a.status}>{t.slotChangeUntil(fmtDateTime(order.closeAt, locale))}</span>
              </section>
            )}

            {order.canCancel ? (
              <section className={a.block}>
                <div className="note"><span className="w9">{t.cancelling}</span> {t.cancelPolicy(fmtDateTime(order.closeAt, locale))}</div>
                <CancelOrderButton locale={locale} number={order.number} />
              </section>
            ) : live && order.status !== "delivered" ? (
              <div className="note">{t.cancelClosedPolicy} <a href={`mailto:${settings.contactEmail}`} className="w9">{t.contact}</a></div>
            ) : null}

            {order.reorder && (
              <div className={a.actions}>
                <ReorderButton locale={locale} dropId={order.reorder.dropId} items={order.reorder.items} boxes={order.reorder.boxes} />
                <span className={a.status}>{t.orderAgainHint}</span>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
