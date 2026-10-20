import Link from "next/link";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import styles from "./Nav.module.css";

/** The JA/EN switch (PRD 1.6), shared by the nav and standalone page headers. `hrefFor` maps a locale to the same page in that language. */
export function LangToggle({ locale, hrefFor }: { locale: Locale; hrefFor: (l: Locale) => string }) {
  const t = getStrings(locale);
  return (
    <div role="group" aria-label={t.language} className={styles.lang}>
      {(["ja", "en"] as Locale[]).map((l) => (
        <Link key={l} href={hrefFor(l)} aria-current={l === locale ? "true" : undefined} className={`${styles.langBtn} ${l === locale ? styles.langOn : ""}`}>
          {l.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}
