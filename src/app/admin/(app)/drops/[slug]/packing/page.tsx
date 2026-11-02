import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DropStatePill } from "@/components/admin/DropStatePill";
import { PackToggle } from "@/components/admin/PackToggle";
import { PrintButton } from "@/components/admin/PrintButton";
import { requireAdmin } from "@/lib/admin";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { japanPostLabels, packList } from "@/lib/fulfilment";
import { getStrings } from "@/lib/i18n";
import s from "../../../../admin.module.css";

export const metadata: Metadata = { title: "Pack list" };

const en = getStrings("en");

/**
 * The pack list (PRD 4.6): every paid order on a drop, by number, with a box to tick as each is packed. Printable.
 * Above it, the Japan Post label file for the orders still to ship, with anything to fix before uploading it.
 */
export default async function PackListPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const [list, labels] = await Promise.all([packList(slug), japanPostLabels(slug)]);
  if (!list || !labels) notFound();
  const flagged = labels.file.rows.filter((r) => r.problems.length);
  const { drop: d, rows } = list;
  const packed = rows.filter((r) => r.state === "packed").length;
  const sent = rows.filter((r) => r.state === "shipped" || r.state === "complete").length;
  const toPack = rows.length - packed - sent;
  const cards = rows.filter((r) => r.giftMessage).length;
  return (
    <>
      <div className={s.pageHead}>
        <div>
          <p className={`${s.crumb} ${s.noPrint}`}><Link href="/admin/drops">Drops</Link> · <Link href={`/admin/drops/${d.slug}`}>{d.nameEn}</Link></p>
          <h1 className={`display ${s.pageTitle}`}>Pack list</h1>
          <p className={s.printSub}>{d.nameEn} · ships {fmtDate(d.shipAt)}, arrives {fmtDate(d.arriveAt)}</p>
        </div>
        <div className={s.headActions}>
          <DropStatePill state={d.state} />
          <Link href={`/admin/drops/${d.slug}/production`} className={`btn btn-secondary ${s.btnSm} ${s.noPrint}`}>Production sheet</Link>
          <PrintButton />
        </div>
      </div>
      {list.refusal && <p className={`${s.banner} ${s.noPrint}`}>{list.refusal}</p>}
      {list.packable && list.open.checkouts > 0 && list.open.until && (
        <p className={`${s.banner} ${s.bannerWarn}`} role="status">
          {list.open.checkouts === 1 ? "A checkout begun before the drop closed" : `${list.open.checkouts} checkouts begun before the drop closed`} can still be paid until {fmtDateTime(list.open.until)}. Their orders join this list when they are; refresh after that.
        </p>
      )}
      {labels.file.rows.length > 0 && (
        <section aria-labelledby="jp-labels" className={`panel ${s.formSection} ${s.noPrint} ${s.labelsPanel}`}>
          <h2 id="jp-labels" className={s.sectionTitle}>Japan Post labels</h2>
          <p className={s.sectionIntro}>
            A file for Webゆうパックプリント with the {labels.file.rows.length === 1 ? "order" : `${labels.file.rows.length} orders`} still to ship: upload it there to print the labels. Each label carries the order number in 記事.
          </p>
          {labels.warning && <p className={`${s.banner} ${s.bannerWarn}`}>{labels.warning}</p>}
          {labels.file.fileProblems.length > 0 ? (
            <div role="alert" className={s.labelsBlocked}>
              <p><strong>The file can&apos;t be made yet:</strong></p>
              <ul>{labels.file.fileProblems.map((p) => <li key={p}>{p}</li>)}</ul>
              <Link href="/admin/settings">Open Settings</Link>
            </div>
          ) : (
            <p><a href={`/admin/drops/${d.slug}/japan-post`} className={`btn btn-primary ${s.btnSm}`} download>Download the label file (CSV)</a></p>
          )}
          {flagged.length > 0 && (
            <div className={s.labelsFlagged}>
              <p><strong>{flagged.length === 1 ? "One order needs" : `${flagged.length} orders need`} a look in the tool before printing:</strong></p>
              <ul>
                {flagged.map((r) => (
                  <li key={r.number}><Link href={`/admin/orders/${r.number}`}>{r.number}</Link>: {r.problems.join(" ")}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {rows.length === 0 ? (
        <div className={`panel ${s.empty}`}>No paid orders on this drop yet.</div>
      ) : (
        <>
          <p className={s.resultCount}>
            {rows.length} order{rows.length === 1 ? "" : "s"}: {toPack} to pack, {packed} packed{sent ? `, ${sent} shipped` : ""}. {cards ? `${cards} with a handwritten card.` : "No gift cards."}
          </p>
          <table className={`${s.table} ${s.packTable}`}>
            <thead><tr><th>Packed</th><th>Order</th><th>To</th><th>Boxes</th><th>Gift card</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const shipped = r.state === "shipped" || r.state === "complete";
                return (
                  <tr key={r.number} className={r.state !== "paid" ? s.packDone : undefined}>
                    <td className={s.packCell}>
                      {shipped ? <span className={s.pill}>Shipped</span> : <PackToggle key={`${r.number}:${r.state}`} number={r.number} packed={r.state === "packed"} disabled={!list.packable} />}
                    </td>
                    <td><Link href={`/admin/orders/${r.number}`} className={s.rowLink}>{r.number}</Link></td>
                    <td>
                      {r.shipToName}
                      <span className={s.sub}>{r.ward} · {en.deliverySlots[r.slot]}</span>
                    </td>
                    <td>
                      <ul className={s.packLines}>
                        {r.lines.map((l) => <li key={l.name}><strong>{l.qty} ×</strong> {l.name}</li>)}
                      </ul>
                    </td>
                    <td className={r.giftMessage ? s.packGift : undefined}>{r.giftMessage ?? <span className={s.muted}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
