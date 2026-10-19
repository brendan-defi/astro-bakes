"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { drop, type Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { CartIcon } from "./icons";
import { Logo } from "./Logo";
import styles from "./Nav.module.css";

export function Nav({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  const { count, hydrated } = useCart();
  const pathname = usePathname();
  const other: Locale = locale === "en" ? "ja" : "en";
  const swap = (to: Locale) => pathname.replace(/^\/(en|ja)/, `/${to}`);
  return (
    <header className={styles.nav}>
      <div className={`container ${styles.row}`}>
        <span className={styles.logoSm}><Logo href={`/${locale}`} label={t.home} size="sm" /></span>
        <span className={styles.logoLg}><Logo href={`/${locale}`} label={t.home} size="lg" /></span>
        <div className={styles.right}>
          <div role="group" aria-label={t.language} className={styles.lang}>
            {(["ja", "en"] as Locale[]).map((l) => (
              <Link key={l} href={swap(l)} aria-current={l === locale ? "true" : undefined} className={`${styles.langBtn} ${l === locale ? styles.langOn : ""}`}>
                {l.toUpperCase()}
              </Link>
            ))}
          </div>
          {drop.state === "open" && (
            <Link href={`/${locale}/checkout`} aria-label={t.cart} className={styles.cart}>
              <CartIcon />
              {hydrated && count > 0 && <span key={count} className={styles.badge}>{count}</span>}
            </Link>
          )}
          <Link href="#top" className={styles.signIn}>{t.signIn}</Link>
        </div>
      </div>
      <span className="sr-only">{other}</span>
    </header>
  );
}
