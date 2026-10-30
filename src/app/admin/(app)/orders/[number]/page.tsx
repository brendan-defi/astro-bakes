import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderMoneyActions } from "@/components/admin/OrderMoneyActions";
import { OrderNoteForm } from "@/components/admin/OrderNoteForm";
import { OrderStatePill } from "@/components/admin/OrderStatePill";
import { requireAdmin } from "@/lib/admin";
import { getStrings } from "@/lib/i18n";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { orderDetail } from "@/lib/orders-admin";
import s from "../../../admin.module.css";

export const metadata: Metadata = { title: "Order" };

const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;
const PAYMENT = { card: "Card", paypay: "PayPay" } as const;
const en = getStrings("en");

/** One order (PRD 4.4): everything the customer sees, plus the timeline and the shop's internal notes. */
export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  await requireAdmin();
  const { number } = await params;
  const o = await orderDetail(decodeURIComponent(number));
  if (!o) notFound();
  return (
    <>
      <div className={s.pageHead}>
        <div>
          <p className={s.crumb}><Link href="/admin/orders">Orders</Link> · <Link href={`/admin/orders?drop=${o.drop.slug}`}>{o.drop.name}</Link></p>
          <h1 className={`display ${s.pageTitle}`}>{o.number}</h1>
        </div>
        <div className={s.headActions}>
          <OrderStatePill state={o.state} />
          <span className={s.headTotal}>{yen(o.total)}</span>
        </div>
      </div>
      {o.state === "expired" && o.storedState === "pending_payment" && (
        <p className={s.banner}>Its checkout&apos;s hold has run out, so it can no longer be paid. It shows as expired until the daily sweep marks it so.</p>
      )}
      <div className={s.detailGrid}>
        <div className={s.detailMain}>
          <section aria-labelledby="o-items" className={`panel ${s.formSection}`}>
            <h2 id="o-items" className={s.sectionTitle}>Boxes</h2>
            <table className={`${s.table} ${s.tableFlat}`}>
              <thead><tr><th>Box</th><th className={s.num}>Qty</th><th className={s.num}>Price</th><th className={s.num}>Line</th></tr></thead>
              <tbody>
                {o.lines.map((l) => (
                  <tr key={l.name}><td>{l.name}{l.nameJa && <span className={s.sub}>{l.nameJa}</span>}</td><td className={s.num}>{l.qty}</td><td className={s.num}>{yen(l.unitPrice)}</td><td className={s.num}>{yen(l.qty * l.unitPrice)}</td></tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={3}>Subtotal</td><td className={s.num}>{yen(o.subtotal)}</td></tr>
                <tr><td colSpan={3}>Shipping</td><td className={s.num}>{o.shippingFee ? yen(o.shippingFee) : "Included"}</td></tr>
                <tr className={s.totalRow}><td colSpan={3}>Total (税込)</td><td className={s.num}>{yen(o.total)}</td></tr>
                {o.refunded > 0 && <tr><td colSpan={3}>Refunded</td><td className={s.num}>−{yen(o.refunded)}</td></tr>}
              </tfoot>
            </table>
          </section>

          {o.giftMessage && (
            <section aria-labelledby="o-gift" className={`panel ${s.formSection} ${s.giftPanel}`}>
              <h2 id="o-gift" className={s.sectionTitle}>Gift card (handwritten)</h2>
              <p className={s.giftText}>{o.giftMessage}</p>
            </section>
          )}

          <section aria-labelledby="o-delivery" className={`panel ${s.formSection}`}>
            <h2 id="o-delivery" className={s.sectionTitle}>Delivery</h2>
            <dl className={s.facts}>
              <dt>Recipient</dt><dd>{o.shipTo.name}</dd>
              <dt>Phone</dt><dd>{o.shipTo.phone}</dd>
              <dt>Address</dt><dd>{o.shipTo.address}</dd>
              <dt>Ships</dt><dd>{fmtDate(o.drop.shipAt)}, arrives {fmtDate(o.drop.arriveAt)}</dd>
              <dt>Time slot</dt><dd>{en.deliverySlots[o.slot]}</dd>
              {o.trackingNumber && (<><dt>Tracking</dt><dd>{o.trackingNumber}</dd></>)}
            </dl>
          </section>

          <section aria-labelledby="o-customer" className={`panel ${s.formSection}`}>
            <h2 id="o-customer" className={s.sectionTitle}>Customer</h2>
            <dl className={s.facts}>
              <dt>Name</dt><dd>{o.customer.name ?? "—"}</dd>
              <dt>Email</dt><dd><a href={`mailto:${o.customer.email}`}>{o.customer.email}</a>{!o.customer.verified && <span className={s.sub}>Not verified</span>}</dd>
              <dt>Phone</dt><dd>{o.customer.phone ?? "—"}</dd>
              <dt>Language</dt><dd>{o.locale === "ja" ? "Japanese" : "English"}</dd>
              <dt>Placed</dt><dd>{fmtDateTime(o.placedAt)}</dd>
            </dl>
          </section>

          <section aria-labelledby="o-payment" className={`panel ${s.formSection}`}>
            <h2 id="o-payment" className={s.sectionTitle}>Payment</h2>
            <dl className={s.facts}>
              <dt>Method</dt><dd>{o.payment.method ? PAYMENT[o.payment.method] : "—"}</dd>
              <dt>Paid</dt><dd>{o.payment.paidAt ? fmtDateTime(o.payment.paidAt) : "Not paid"}</dd>
              {o.payment.intent && (<><dt>Stripe</dt><dd className={s.mono}>{o.payment.intent}</dd></>)}
            </dl>
          </section>

          {o.payment.paidAt && (
            <section aria-labelledby="o-money" className={`panel ${s.formSection}`}>
              <h2 id="o-money" className={s.sectionTitle}>Cancel or refund</h2>
              <OrderMoneyActions number={o.number} canCancel={o.canCancel} refundable={o.refundable} refunded={o.refunded} dropOpen={o.drop.state === "open"} email={o.customer.email} />
            </section>
          )}
        </div>

        <aside aria-labelledby="o-timeline" className={`panel ${s.formSection} ${s.detailSide}`}>
          <h2 id="o-timeline" className={s.sectionTitle}>Timeline</h2>
          <ol className={s.timeline}>
            {o.timeline.map((e, i) => (
              <li key={i} className={s[`tl_${e.kind}`]}>
                <span className={s.tlWhen}>{fmtDateTime(e.at)}</span>
                <span className={s.tlTitle}>{e.title}{e.by && <span className={s.tlBy}> · {e.by}</span>}</span>
                {e.detail && <span className={e.kind === "note" ? s.tlNote : s.tlDetail}>{e.detail}</span>}
              </li>
            ))}
          </ol>
          <OrderNoteForm number={o.number} />
        </aside>
      </div>
    </>
  );
}
