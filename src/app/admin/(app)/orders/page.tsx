import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatePill } from "@/components/admin/OrderStatePill";
import { requireAdmin } from "@/lib/admin";
import { fmtDateTime } from "@/lib/format";
import { FILTER_STATES, filterQuery, ORDER_STATE_LABEL, PAGE_SIZE, parseOrderFilters } from "@/lib/order-admin-rules";
import { dropFilterOptions, listOrders } from "@/lib/orders-admin";
import s from "../../admin.module.css";

export const metadata: Metadata = { title: "Orders" };

const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;
const PAYMENT = { card: "Card", paypay: "PayPay" } as const;

/** Every order, newest first, filtered by drop, state and a search (PRD 4.4). */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const filters = parseOrderFilters(await searchParams);
  const [{ rows, total }, dropOptions] = await Promise.all([listOrders(filters), dropFilterOptions()]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A page that existed when its link was made runs out as orders change state; show the last one there is.
  if (filters.page > pages) redirect(`/admin/orders${filterQuery(filters, { page: pages })}`);
  const filtered = !!(filters.drop || filters.state || filters.q);
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>Orders</h1>
        <a href={`/admin/orders/export${filterQuery(filters, { page: 1 })}`} className={`btn btn-secondary ${s.btnSm}`} download>Export CSV</a>
      </div>
      {/* Keyed by the applied filters: Clear and Back are client navigations, and React would otherwise keep the old choices in the fields. */}
      <form key={filterQuery(filters, { page: 1 })} method="get" className={s.filterBar} role="search" aria-label="Filter orders">
        <label>
          <span className="label">Drop</span>
          <select name="drop" className="input" defaultValue={filters.drop ?? ""}>
            <option value="">All drops</option>
            {dropOptions.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Status</span>
          <select name="state" className="input" defaultValue={filters.state ?? ""}>
            <option value="">Any status</option>
            {FILTER_STATES.map((st) => <option key={st} value={st}>{ORDER_STATE_LABEL[st]}</option>)}
          </select>
        </label>
        <label className={s.filterSearch}>
          <span className="label">Search</span>
          <input type="search" name="q" className="input" defaultValue={filters.q ?? ""} placeholder="Order number, name, email or phone" />
        </label>
        <button type="submit" className={`btn btn-primary ${s.btnSm}`}>Filter</button>
        {filtered && <Link href="/admin/orders" className={s.linkBtn}>Clear</Link>}
      </form>
      <p className={s.resultCount} role="status">{total === 0 ? "No orders" : `${total.toLocaleString("en-US")} order${total === 1 ? "" : "s"}`}{filtered ? " match" : ""}{pages > 1 ? ` · page ${filters.page} of ${pages}` : ""}</p>
      {rows.length === 0 ? (
        <div className={`panel ${s.empty}`}>{filtered ? "Nothing matches these filters." : "No orders yet. They show up here as soon as customers check out."}</div>
      ) : (
        <table className={s.table}>
          <thead>
            <tr><th>Order</th><th>Customer</th><th>Boxes</th><th className={s.num}>Total</th><th>Payment</th><th>Status</th><th>Placed</th></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.number}>
                <td>
                  <Link href={`/admin/orders/${o.number}`} className={s.rowLink}>{o.number}</Link>
                  <span className={s.sub}>Drop {String(o.drop.number).padStart(2, "0")}</span>
                </td>
                <td>
                  {o.customer}
                  <span className={s.sub}>{o.email}</span>
                  {o.shipToName !== o.customer && <span className={s.sub}>To {o.shipToName}</span>}
                </td>
                <td>{o.boxes}{o.gift && <span className={s.sub}>Gift card</span>}</td>
                <td className={s.num}>{yen(o.total)}</td>
                <td>{o.paymentMethod ? PAYMENT[o.paymentMethod] : "—"}</td>
                <td><OrderStatePill state={o.state} /></td>
                <td>{fmtDateTime(o.placedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className={s.pager}>
          {filters.page > 1 ? <Link href={`/admin/orders${filterQuery(filters, { page: filters.page - 1 })}`} className={s.linkBtn}>← Newer</Link> : <span />}
          {filters.page < pages && <Link href={`/admin/orders${filterQuery(filters, { page: filters.page + 1 })}`} className={s.linkBtn}>Older →</Link>}
        </nav>
      )}
    </>
  );
}
