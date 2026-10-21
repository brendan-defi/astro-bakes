import type { Metadata } from "next";
import { CatalogueTabs } from "@/components/admin/CatalogueTabs";
import { ItemForm } from "@/components/admin/ItemForm";
import { requireAdmin } from "@/lib/admin";
import s from "../../../admin.module.css";

export const metadata: Metadata = { title: "New item" };

export default async function NewItemPage() {
  await requireAdmin();
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>New item</h1>
      </div>
      <CatalogueTabs current="items" />
      <ItemForm slug={null} initial={null} />
    </>
  );
}
