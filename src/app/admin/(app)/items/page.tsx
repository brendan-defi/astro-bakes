import type { Metadata } from "next";
import Link from "next/link";
import { CatalogueTabs } from "@/components/admin/CatalogueTabs";
import { requireAdmin } from "@/lib/admin";
import { listItems } from "@/lib/catalogue";
import s from "../../admin.module.css";

export const metadata: Metadata = { title: "Items" };

/** The things the kitchen bakes (PRD 4.3); boxes are made of them, and the production sheet counts them. */
export default async function ItemsPage() {
  await requireAdmin();
  const items = await listItems();
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>Boxes &amp; items</h1>
        <Link href="/admin/items/new" className={`btn btn-primary ${s.btnSm}`}>New item</Link>
      </div>
      <CatalogueTabs current="items" />
      {items.length === 0 ? (
        <div className={`panel ${s.empty}`}>No items yet. Create the first one.</div>
      ) : (
        <table className={s.table}>
          <thead>
            <tr><th>Item</th><th>Baked as</th><th className={s.num}>Used in</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.slug}>
                <td>
                  <Link href={`/admin/items/${i.slug}`} className={s.rowLink}>{i.nameEn}</Link>
                  <span className={s.sub}>{i.nameJa ?? "No Japanese name"}</span>
                </td>
                <td>{i.unitsPerProductionUnit === 1 ? `1 per ${i.productionUnit}` : `${i.unitsPerProductionUnit} per ${i.productionUnit}`}</td>
                <td className={s.num}>{i.boxes === 0 ? "No boxes" : `${i.boxes} box${i.boxes === 1 ? "" : "es"}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
