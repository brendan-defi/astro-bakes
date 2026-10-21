import type { Metadata } from "next";
import Link from "next/link";
import { CatalogueTabs } from "@/components/admin/CatalogueTabs";
import { requireAdmin } from "@/lib/admin";
import { listBoxes } from "@/lib/catalogue";
import s from "../../admin.module.css";

export const metadata: Metadata = { title: "Boxes" };

const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

/** Every box (PRD 4.3), active or not, in menu order. */
export default async function BoxesPage() {
  await requireAdmin();
  const boxes = await listBoxes();
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>Boxes &amp; items</h1>
        <Link href="/admin/boxes/new" className={`btn btn-primary ${s.btnSm}`}>New box</Link>
      </div>
      <CatalogueTabs current="boxes" />
      {boxes.length === 0 ? (
        <div className={`panel ${s.empty}`}>No boxes yet. Create the first one.</div>
      ) : (
        <table className={s.table}>
          <thead>
            <tr><th>Box</th><th>What's in it</th><th className={s.num}>Price</th><th className={s.num}>Default cap</th><th className={s.num}>Per customer</th><th>Status</th></tr>
          </thead>
          <tbody>
            {boxes.map((b) => (
              <tr key={b.slug}>
                <td>
                  <Link href={`/admin/boxes/${b.slug}`} className={s.rowLink}>{b.nameEn}</Link>
                  <span className={s.sub}>{b.nameJa ?? "No Japanese name"}</span>
                </td>
                <td>{b.recipe || <span className={s.muted}>No items</span>}{b.allergens.length > 0 && <span className={s.sub}>Allergens: {b.allergens.join(", ")}</span>}</td>
                <td className={s.num}>{yen(b.price)}</td>
                <td className={s.num}>{b.defaultCap}</td>
                <td className={s.num}>{b.defaultMaxPerCustomer}</td>
                <td>
                  <span className={`${s.pill} ${b.active ? s.pillOn : s.pillOff}`}>{b.active ? "Active" : "Hidden"}</span>
                  <span className={s.sub}>{b.drops === 0 ? "In no drops" : `In ${b.drops} drop${b.drops === 1 ? "" : "s"}`}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
