import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentCustomer } from "@/lib/auth";
import { getStrings, isLocale } from "@/lib/i18n";
import { signOutAction } from "../auth/actions";
import { Logo } from "@/components/Logo";
import { ArrowLeftIcon } from "@/components/icons";
import s from "@/components/checkout.module.css";

/** Minimal account page for now: who you are and sign out. Order history and the notification toggle follow (PRD 2.4, 2.5). */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const me = await currentCustomer();
  if (!me) redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/account`)}`);
  const t = getStrings(locale);
  const home = `/${locale}`;
  async function signOut() {
    "use server";
    await signOutAction();
    redirect(home);
  }
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
            <h1 className={`display ${s.h1sm}`}>{t.accountTitle}</h1>
            <p className={s.lead}>{t.signedInAs(me.email)}</p>
            {me.name && <p className="w7">{me.name}{me.phone ? ` · ${me.phone}` : ""}</p>}
            {me.address && <p className="w7" style={{ fontSize: 15 }}>〒{me.address.postalCode} {me.address.prefecture}{me.address.city}{me.address.town ?? ""}{me.address.line1}{me.address.line2 ? ` ${me.address.line2}` : ""}</p>}
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary raised">{t.signOut}</button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
