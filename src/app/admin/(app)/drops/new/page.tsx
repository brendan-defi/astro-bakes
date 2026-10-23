import type { Metadata } from "next";
import { DropForm } from "@/components/admin/DropForm";
import { requireAdmin } from "@/lib/admin";
import { boxChoices, nextDropNumber } from "@/lib/drops-admin";
import { arrivalOffsetDays } from "@/lib/settings";
import s from "../../../admin.module.css";

export const metadata: Metadata = { title: "New drop" };

/** A new drop starts as a draft with every active box at its defaults (D10). */
export default async function NewDropPage() {
  await requireAdmin();
  const [number, choices, offset] = await Promise.all([nextDropNumber(), boxChoices(), arrivalOffsetDays()]);
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>New drop</h1>
      </div>
      <DropForm slug={null} initial={null} number={number} state="draft" choices={choices} arrivalOffsetDays={offset} />
    </>
  );
}
