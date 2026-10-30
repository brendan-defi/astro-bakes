import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DropEditor } from "@/components/admin/DropEditor";
import { DropStatePill } from "@/components/admin/DropStatePill";
import { requireAdmin } from "@/lib/admin";
import { fromJstLocal, toJstLocal } from "@/lib/drop-rules";
import { boxChoices, cancelImpact, dropEmailsOwedCount, dropForForm } from "@/lib/drops-admin";
import { arrivalOffsetDays } from "@/lib/settings";
import { duplicateDropAction } from "../actions";
import s from "../../../admin.module.css";

export const metadata: Metadata = { title: "Edit drop" };

/** Reopen's suggested closing time: tomorrow at 21:00 Japan time, or the last hour before the ship date if that is sooner. */
function reopenDefault(shipAt: Date, now = new Date()): string {
  const tomorrowEvening = fromJstLocal(`${toJstLocal(new Date(now.getTime() + 86_400_000)).slice(0, 10)}T21:00`)!;
  const lastHour = new Date(shipAt.getTime() - 3_600_000);
  return toJstLocal(tomorrowEvening < lastHour ? tomorrowEvening : lastHour);
}

export default async function EditDropPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ created?: string; duplicated?: string }> }) {
  await requireAdmin();
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const [drop, choices, offset, impact, emailsOwed] = await Promise.all([dropForForm(slug), boxChoices(), arrivalOffsetDays(), cancelImpact(slug), dropEmailsOwedCount(slug)]);
  if (!drop) notFound();
  const notice = q.created === "1" ? "Created as a draft. It isn't on the shop until it's scheduled." : q.duplicated === "1" ? "Duplicated: a new draft, every date a month later. Check the dates and names." : undefined;
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>{drop.nameEn}</h1>
        <div className={s.headActions}>
          <DropStatePill state={drop.state} />
          <Link href={`/admin/drops/${drop.slug}/production`} className={`btn btn-secondary ${s.btnSm}`}>Production sheet</Link>
          <Link href={`/admin/drops/${drop.slug}/packing`} className={`btn btn-secondary ${s.btnSm}`}>Pack list</Link>
          <form action={duplicateDropAction.bind(null, drop.slug)}>
            <button type="submit" className={`btn btn-secondary ${s.btnSm}`}>Duplicate</button>
          </form>
        </div>
      </div>
      <DropEditor
        lifecycle={{ slug: drop.slug, number: drop.number, state: drop.state, storedState: drop.storedState, reopenDefault: reopenDefault(drop.shipAt), cancelImpact: impact, emailsOwed }}
        form={{ slug: drop.slug, initial: drop, number: drop.number, state: drop.state, choices, arrivalOffsetDays: offset, notice, version: drop.updatedAt.getTime() }}
      />
    </>
  );
}
