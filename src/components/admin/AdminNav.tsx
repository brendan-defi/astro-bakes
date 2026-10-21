"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "@/app/admin/admin.module.css";

/**
 * The admin sections (PRD 4: Dashboard · Drops · Boxes · Orders · Customers ·
 * Announcements · Settings). Each one joins this list in the PR that builds it.
 */
export const ADMIN_SECTIONS: { href: string; label: string; also?: string[] }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/boxes", label: "Boxes & items", also: ["/admin/items"] },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();
  const under = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = (x: (typeof ADMIN_SECTIONS)[number]) => (x.href === "/admin" ? pathname === "/admin" : [x.href, ...(x.also ?? [])].some(under));
  return (
    <nav aria-label="Admin" className={s.nav}>
      {ADMIN_SECTIONS.map((x) => (
        <Link key={x.href} href={x.href} className={s.navLink} aria-current={current(x) ? "page" : undefined}>{x.label}</Link>
      ))}
    </nav>
  );
}
