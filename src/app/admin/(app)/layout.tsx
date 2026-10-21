import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import { SITE_URL } from "@/lib/metadata";
import { signOutAdminAction } from "../auth/actions";
import s from "../admin.module.css";

/** The signed-in shell: sidebar nav, who's signed in, sign out. Pages still call requireAdmin themselves. */
export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className={s.shell}>
      <aside className={s.side}>
        <Link href="/admin" className={s.brand}>
          <span className={`logo-face ${s.logo}`}>Astro Bakes</span>
          <span className={s.tag}>Admin</span>
        </Link>
        <AdminNav />
        <div className={s.sideFoot}>
          <a href={SITE_URL} target="_blank" rel="noreferrer">View the shop ↗</a>
          <span className={`small ${s.who}`}>{admin.email}</span>
          <form action={signOutAdminAction}>
            <button type="submit" className={s.linkBtn}>Sign out</button>
          </form>
        </div>
      </aside>
      <main className={s.main}>{children}</main>
    </div>
  );
}
