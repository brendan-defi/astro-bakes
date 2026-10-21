import Link from "next/link";
import type { Locale } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { CheckIcon } from "./icons";
import s from "./home.module.css";

/** A signed-in customer who gets drop emails: a status, not a control. The real toggle is on the account page (PRD 2.4). */
export function OnListStatus({ locale, text, linkId }: { locale: Locale; text: string; linkId?: string }) {
  const t = getStrings(locale);
  return (
    <div className={s.notifyDone}>
      <span className={s.ok}><CheckIcon strokeWidth={3} /></span>
      <div>
        <div className="w9">{text}</div>
        <Link id={linkId} href={`/${locale}/account#notify-h`} className="small w9">{t.emailSettings} →</Link>
      </div>
    </div>
  );
}
