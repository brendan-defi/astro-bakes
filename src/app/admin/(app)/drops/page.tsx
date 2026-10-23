import type { Metadata } from "next";
import Link from "next/link";
import { DropStatePill } from "@/components/admin/DropStatePill";
import { requireAdmin } from "@/lib/admin";
import { listDropsAdmin } from "@/lib/drops-admin";
import { fmtDate, fmtDateTime } from "@/lib/format";
import s from "../../admin.module.css";

export const metadata: Metadata = { title: "Drops" };

const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

/** Every drop, newest first (PRD 4.2), with its state as the shop sees it right now. */
export default async function DropsPage() {
  await requireAdmin();
  const drops = await listDropsAdmin();
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>Drops</h1>
        <Link href="/admin/drops/new" className={`btn btn-primary ${s.btnSm}`}>New drop</Link>
      </div>
      {drops.length === 0 ? (
        <div className={`panel ${s.empty}`}>No drops yet. Create the first one.</div>
      ) : (
        <table className={s.table}>
          <thead>
            <tr><th>Drop</th><th>Status</th><th>Opens</th><th>Closes</th><th>Ships</th><th className={s.num}>Sold</th><th className={s.num}>Orders</th><th className={s.num}>Revenue</th></tr>
          </thead>
          <tbody>
            {drops.map((d) => (
              <tr key={d.slug}>
                <td>
                  <Link href={`/admin/drops/${d.slug}`} className={s.rowLink}>{d.nameEn}</Link>
                  <span className={s.sub}>Drop {String(d.number).padStart(2, "0")}</span>
                </td>
                <td><DropStatePill state={d.state} /></td>
                <td>{fmtDateTime(d.openAt)}</td>
                <td>{fmtDateTime(d.closeAt)}</td>
                <td>{fmtDate(d.shipAt)}</td>
                <td className={s.num}>{d.sold} / {d.cap}</td>
                <td className={s.num}>{d.orders}</td>
                <td className={s.num}>{yen(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
