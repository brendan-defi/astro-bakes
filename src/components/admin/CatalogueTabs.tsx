import Link from "next/link";
import s from "@/app/admin/admin.module.css";

/** Boxes | Items: the two halves of the catalogue (PRD 4.3), one nav section. */
export function CatalogueTabs({ current }: { current: "boxes" | "items" }) {
  return (
    <nav aria-label="Catalogue" className={s.tabs}>
      <Link href="/admin/boxes" className={s.tab} aria-current={current === "boxes" ? "page" : undefined}>Boxes</Link>
      <Link href="/admin/items" className={s.tab} aria-current={current === "items" ? "page" : undefined}>Items</Link>
    </nav>
  );
}
