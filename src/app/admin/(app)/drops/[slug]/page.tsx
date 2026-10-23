import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DropForm } from "@/components/admin/DropForm";
import { DropStatePill } from "@/components/admin/DropStatePill";
import { requireAdmin } from "@/lib/admin";
import { boxChoices, dropForForm } from "@/lib/drops-admin";
import { arrivalOffsetDays } from "@/lib/settings";
import { duplicateDropAction } from "../actions";
import s from "../../../admin.module.css";

export const metadata: Metadata = { title: "Edit drop" };

export default async function EditDropPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ created?: string; duplicated?: string }> }) {
  await requireAdmin();
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const [drop, choices, offset] = await Promise.all([dropForForm(slug), boxChoices(), arrivalOffsetDays()]);
  if (!drop) notFound();
  const notice = q.created === "1" ? "Created as a draft. It isn't on the shop until it's scheduled." : q.duplicated === "1" ? "Duplicated: a new draft, every date a month later. Check the dates and names." : undefined;
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>{drop.nameEn}</h1>
        <div className={s.headActions}>
          <DropStatePill state={drop.state} />
          <form action={duplicateDropAction.bind(null, drop.slug)}>
            <button type="submit" className={`btn btn-secondary ${s.btnSm}`}>Duplicate</button>
          </form>
        </div>
      </div>
      <DropForm slug={drop.slug} initial={drop} number={drop.number} state={drop.state} choices={choices} arrivalOffsetDays={offset} notice={notice} />
    </>
  );
}
