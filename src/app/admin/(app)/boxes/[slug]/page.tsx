import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoxForm } from "@/components/admin/BoxForm";
import { CatalogueTabs } from "@/components/admin/CatalogueTabs";
import { requireAdmin } from "@/lib/admin";
import { boxBySlug, itemOptions } from "@/lib/catalogue";
import s from "../../../admin.module.css";

export const metadata: Metadata = { title: "Edit box" };

export default async function EditBoxPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireAdmin();
  const [{ slug }, { created }] = await Promise.all([params, searchParams]);
  const [box, options] = await Promise.all([boxBySlug(slug), itemOptions()]);
  if (!box) notFound();
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>{box.nameEn}</h1>
      </div>
      <CatalogueTabs current="boxes" />
      <BoxForm slug={box.slug} initial={box} items={options} created={created === "1"} />
    </>
  );
}
