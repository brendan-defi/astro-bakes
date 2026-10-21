import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogueTabs } from "@/components/admin/CatalogueTabs";
import { ItemForm } from "@/components/admin/ItemForm";
import { requireAdmin } from "@/lib/admin";
import { itemBySlug } from "@/lib/catalogue";
import s from "../../../admin.module.css";

export const metadata: Metadata = { title: "Edit item" };

export default async function EditItemPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireAdmin();
  const [{ slug }, { created }] = await Promise.all([params, searchParams]);
  const item = await itemBySlug(slug);
  if (!item) notFound();
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>{item.nameEn}</h1>
      </div>
      <CatalogueTabs current="items" />
      <ItemForm slug={item.slug} initial={item} created={created === "1"} />
    </>
  );
}
