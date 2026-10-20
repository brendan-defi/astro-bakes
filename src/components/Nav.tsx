"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { anonymousViewer, type Locale, type Viewer } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { useDemoQuery } from "@/lib/demo-query";
import { CartIcon } from "./icons";
import { LangToggle } from "./LangToggle";
import { Logo } from "./Logo";
import styles from "./Nav.module.css";

/** Global nav (PRD 1.6). The cart button only exists while a drop is open. */
export function Nav({ locale, showCart = false, viewer = anonymousViewer }: { locale: Locale; showCart?: boolean; viewer?: Viewer }) {
  const t = getStrings(locale);
  const { count, hydrated } = useCart();
  const pathname = usePathname();
  const demoQuery = useDemoQuery();
  const other: Locale = locale === "en" ? "ja" : "en";
  const swap = (to: Locale) => pathname.replace(/^\/(en|ja)/, `/${to}`);
  return (
    <header className={styles.nav}>
      <div className={`container ${styles.row}`}>
        <span className={styles.logoSm}><Logo href={`/${locale}`} label={t.home} size="sm" /></span>
        <span className={styles.logoLg}><Logo href={`/${locale}`} label={t.home} size="lg" /></span>
        <div className={styles.right}>
          <LangToggle locale={locale} hrefFor={swap} />
          {showCart && (
            <Link href={`/${locale}/checkout${demoQuery}`} aria-label={t.cart} className={styles.cart} data-cart-target>
              <CartIcon />
              {hydrated && count > 0 && <span key={count} className={styles.badge}>{count}</span>}
            </Link>
          )}
          {viewer.signedIn ? (
            <Link href={`/${locale}/account`} aria-label={t.yourAccount} className={styles.avatar}>{viewer.initial}</Link>
          ) : (
            <Link href={`/${locale}/sign-in`} className={styles.signIn}>{t.signIn}</Link>
          )}
        </div>
      </div>
      <span className="sr-only">{other}</span>
    </header>
  );
}
