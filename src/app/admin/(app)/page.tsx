import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import s from "../admin.module.css";

export const metadata: Metadata = { title: "Dashboard" };

/** The dashboard (PRD 4.1). A placeholder until the drop and order sections exist to summarise. */
export default async function AdminDashboard() {
  const admin = await requireAdmin();
  return (
    <>
      <div className={s.pageHead}>
        <h1 className={`display ${s.pageTitle}`}>Dashboard</h1>
      </div>
      <div className="panel shadow-4 stack" style={{ padding: "24px 28px", maxWidth: 640, gap: 8 }}>
        <p className="w9">Welcome{admin.name ? `, ${admin.name}` : ""}.</p>
        <p>The admin portal is being built a section at a time: settings, boxes, drops, orders, then packing and shipping. Each one shows up in the menu as it lands.</p>
      </div>
    </>
  );
}
