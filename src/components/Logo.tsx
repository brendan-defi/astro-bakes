import Link from "next/link";
import styles from "./Logo.module.css";

export function Logo({ href, label, size = "sm" }: { href?: string; label?: string; size?: "sm" | "md" | "lg" }) {
  const cls = `${styles.logo} ${styles[size]}`;
  const face = <span className={`logo-face ${styles.face}`}>Astro Bakes</span>;
  if (!href) return <div className={cls}>{face}</div>;
  return <Link href={href} aria-label={label} className={cls}>{face}</Link>;
}
