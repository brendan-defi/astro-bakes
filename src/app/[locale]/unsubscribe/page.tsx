import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { maskEmail } from "@/lib/auth-rules";
import { settings as defaultSettings } from "@/lib/data";
import { loadSettings } from "@/lib/drops";
import { getStrings, isLocale } from "@/lib/i18n";
import { privatePage, stringsFor } from "@/lib/metadata";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { confirmUnsubscribeAction } from "./actions";
import { DocShell } from "@/components/DocShell";
import s from "@/components/checkout.module.css";
import l from "@/components/legal.module.css";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return privatePage(stringsFor(locale).unsubscribeTitle);
}

/**
 * The unsubscribe link from drop emails (PRD 1.5, 2.7). Opening it only asks: mail scanners and link previews
 * fetch links, so a GET must never unsubscribe. The button posts the same signed values to the server action.
 */
export default async function UnsubscribePage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k]?.[0] : q[k]) as string | undefined;
  const t = getStrings(locale);
  const settings = await loadSettings().catch(() => defaultSettings);
  const done = one("done") === "1";
  const e = one("e");
  const token = one("t");
  const email = done ? null : verifyUnsubscribe(e, token);

  const sameView = (to: string) =>
    done ? `/${to}/unsubscribe?done=1` : e && token ? `/${to}/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(token)}` : `/${to}/unsubscribe`;

  return (
    <DocShell locale={locale} settings={settings} hrefFor={sameView}>
      {done ? (
        <>
          <h1 className={`display ${s.h1sm}`}>{t.unsubscribeDoneTitle}</h1>
          <p className={l.lead}>{t.unsubscribeDoneBody}</p>
          {/* Both ways back, without saying which applies: the page mustn't reveal whether the address has an account,
              and the anonymous form can't switch an account holder's own preference back on. */}
          <p className={l.lead}>{t.rejoinAccountBefore}<Link href={`/${locale}/account#notify-h`} className="w9">{t.emailSettings}</Link>{t.rejoinAccountAfter}</p>
          <p className={l.lead}>{t.rejoinNoAccountBefore}<Link href={`/${locale}#notify`} className="w9">{t.rejoinHomepage}</Link>{t.rejoinNoAccountAfter}</p>
        </>
      ) : email ? (
        <>
          <h1 className={`display ${s.h1sm}`}>{t.unsubscribeTitle}</h1>
          <p className={l.lead}>{t.unsubscribeConfirm(maskEmail(email))}</p>
          <form action={confirmUnsubscribeAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="e" value={e} />
            <input type="hidden" name="t" value={token} />
            <button type="submit" className="btn btn-primary">{t.unsubscribeButton}</button>
          </form>
        </>
      ) : (
        <>
          <h1 className={`display ${s.h1sm}`}>{t.unsubscribeInvalidTitle}</h1>
          <p className={l.lead}>{t.unsubscribeInvalidBody(settings.contactEmail)}</p>
        </>
      )}
    </DocShell>
  );
}
