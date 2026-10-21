import type { Metadata } from "next";
import { BoxForm } from "@/components/admin/BoxForm";
import { CatalogueTabs } from "@/components/admin/CatalogueTabs";
import { requireAdmin } from "@/lib/admin";
import { itemOptions } from "@/lib/catalogue";
import s from "../../../admin.module.css";

export const metadata: Metadata = { title: "New box" };

export default async function NewBoxPage() {
  await requireAdmin();
  const options = await itemOptions();
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>New box</h1>
      </div>
      <CatalogueTabs current="boxes" />
      <BoxForm slug={null} initial={null} items={options} />
    </>
  );
}
