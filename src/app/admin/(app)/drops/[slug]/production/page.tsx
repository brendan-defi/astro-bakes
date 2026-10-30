import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DropStatePill } from "@/components/admin/DropStatePill";
import { PrintButton } from "@/components/admin/PrintButton";
import { requireAdmin } from "@/lib/admin";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { countOf } from "@/lib/fulfilment-rules";
import { productionSheet, type SheetDrop } from "@/lib/fulfilment";
import s from "../../../../admin.module.css";

export const metadata: Metadata = { title: "Production sheet" };

/** Whether the numbers can still change, in a line above them. */
function standing(d: SheetDrop): string {
  switch (d.state) {
    case "draft":
    case "scheduled":
      return "The drop hasn't opened, so there's nothing to bake yet.";
    case "open":
      return `A projection: the drop is open until ${fmtDateTime(d.closeAt)}, so these numbers grow with each order.`;
    case "cancelled":
      return "The drop is cancelled; there's nothing to bake.";
    default:
      return `Final: the drop closed ${fmtDateTime(d.closeAt)}.`;
  }
}

/** The production sheet (PRD 4.5): what to bake for a drop, the boxes to assemble and the cards to write. */
export default async function ProductionSheetPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const sheet = await productionSheet(slug);
  if (!sheet) notFound();
  const { drop: d, plan } = sheet;
  return (
    <>
      <div className={s.pageHead}>
        <div>
          <p className={`${s.crumb} ${s.noPrint}`}><Link href="/admin/drops">Drops</Link> · <Link href={`/admin/drops/${d.slug}`}>{d.nameEn}</Link></p>
          <h1 className={`display ${s.pageTitle}`}>Production sheet</h1>
          <p className={s.printSub}>{d.nameEn}</p>
        </div>
        <div className={s.headActions}>
          <DropStatePill state={d.state} />
          <Link href={`/admin/drops/${d.slug}/packing`} className={`btn btn-secondary ${s.btnSm} ${s.noPrint}`}>Pack list</Link>
          <PrintButton />
        </div>
      </div>
      <p className={s.banner}>{standing(d)}</p>
      <dl className={`${s.facts} ${s.sheetFacts}`}>
        <dt>Bake day</dt><dd>{d.bakeAt ? fmtDate(d.bakeAt) : "Not set"}</dd>
        <dt>Ships</dt><dd>{fmtDate(d.shipAt)}, arrives {fmtDate(d.arriveAt)}</dd>
        <dt>Orders</dt><dd>{sheet.orders}</dd>
        <dt>Gift cards</dt><dd>{sheet.giftCards === 0 ? "None" : `${sheet.giftCards} to write by hand`}</dd>
      </dl>

      {plan.unplanned.length > 0 && (
        <p role="alert" className={`${s.banner} ${s.bannerWarn}`}>
          {plan.unplanned.join(", ")} {plan.unplanned.length === 1 ? "has" : "have"} nothing in {plan.unplanned.length === 1 ? "its" : "their"} recipe, so {plan.unplanned.length === 1 ? "it isn't" : "they aren't"} counted below. Add the items under Boxes &amp; items.
        </p>
      )}

      {plan.totalBoxes === 0 ? (
        <div className={`panel ${s.empty}`}>No paid orders on this drop yet.</div>
      ) : (
        <>
          <section aria-labelledby="sheet-bake" className={s.sheetSection}>
            <h2 id="sheet-bake" className={s.sectionTitle}>What to bake</h2>
            <table className={`${s.table} ${s.sheetTable}`}>
              <thead><tr><th>Item</th><th className={s.num}>Needed</th><th>Baked as</th><th className={s.num}>To bake</th><th className={s.num}>Left over</th></tr></thead>
              <tbody>
                {plan.items.map((r) => (
                  <tr key={r.item.slug}>
                    <td>{r.item.nameEn}{r.item.nameJa && <span className={s.sub}>{r.item.nameJa}</span>}</td>
                    <td className={s.num}>{r.needed}</td>
                    <td>{r.item.unitsPerProductionUnit} per {r.item.productionUnit}</td>
                    <td className={`${s.num} ${s.toBake}`}>
                      {countOf(r.toBake, r.item.productionUnit)}
                      {r.buffer > 0 && <span className={s.sub}>{r.base} + {r.buffer} spare</span>}
                    </td>
                    <td className={s.num}>{r.spare || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={s.help}>To bake = needed ÷ how many each makes, rounded up, plus the item&apos;s spare (set on each item). Left over counts what&apos;s spare once every box is filled.</p>
          </section>

          <section aria-labelledby="sheet-boxes" className={s.sheetSection}>
            <h2 id="sheet-boxes" className={s.sectionTitle}>Boxes to assemble</h2>
            <table className={`${s.table} ${s.sheetTable} ${s.sheetNarrow}`}>
              <thead><tr><th>Box</th><th className={s.num}>Count</th></tr></thead>
              <tbody>
                {plan.boxes.map((b) => (
                  <tr key={b.nameEn}><td>{b.nameEn}</td><td className={s.num}>{b.count}</td></tr>
                ))}
              </tbody>
              <tfoot><tr className={s.totalRow}><td>Total</td><td className={s.num}>{plan.totalBoxes}</td></tr></tfoot>
            </table>
          </section>
        </>
      )}
    </>
  );
}
