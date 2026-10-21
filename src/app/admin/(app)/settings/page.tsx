import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { requireAdmin } from "@/lib/admin";
import { settingsForForm } from "@/lib/settings";
import s from "../../admin.module.css";

export const metadata: Metadata = { title: "Settings" };

/** Store, legal, notification and shipping settings (PRD 4.9). */
export default async function SettingsPage() {
  await requireAdmin();
  const values = await settingsForForm();
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>Settings</h1>
      </div>
      <SettingsForm initial={values} />
    </>
  );
}
