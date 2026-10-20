import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentCustomer, peekLink } from "@/lib/auth";
import { getStrings, isLocale } from "@/lib/i18n";
import { privatePage, stringsFor } from "@/lib/metadata";
import { confirmLinkAction } from "../actions";
import { Logo } from "@/components/Logo";
import { ArrowLeftIcon } from "@/components/icons";
import s from "@/components/checkout.module.css";

type Query = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return privatePage(stringsFor(locale).signIn);
}

/** Shown when a sign-in link is opened in a browser that didn't request it: confirm before any session changes. */
export default async function ConfirmPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const token = (Array.isArray(q.token) ? q.token[0] : q.token) ?? "";
  const [peek, me] = await Promise.all([peekLink(token), currentCustomer()]);
  const t = getStrings(locale);
  const home = `/${locale}`;
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={`container ${s.headerRow}`}>
          <Link href={home} aria-label={t.backToShop} className={s.iconBtn}><ArrowLeftIcon /></Link>
          <Logo href={home} label={t.home} size="sm" />
          <span className={s.spacer} />
        </div>
      </header>
      <div className={s.body}>
        <main className={s.main}>
          <div className={`stack ${s.narrow}`} style={{ gap: 16 }}>
            {!peek.ok ? (
              <>
                <h1 className={`display ${s.h1sm}`}>{t.linkInvalidTitle}</h1>
                <p className={s.lead}>{t.linkExpired}</p>
                <Link href={`${home}/sign-in`} className={`btn btn-primary ${s.selfStart}`}>{t.requestNewLink}</Link>
              </>
            ) : (
              <>
                <h1 className={`display ${s.h1sm}`}>{t.confirmSignInTitle}</h1>
                <p className={s.lead}>{t.confirmSignInBody(peek.maskedEmail)}</p>
                {me && me.email !== peek.email && <div className="note">{t.confirmReplaces(me.email)}</div>}
                <form action={confirmLinkAction.bind(null, locale, token)}>
                  <button type="submit" className={`btn btn-primary ${s.selfStart}`}>{t.confirmSignIn}</button>
                </form>
                <Link href={home} className="w9">{t.notYou}</Link>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
