import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentCustomer } from "@/lib/auth";
import { loadOrders } from "@/lib/account";
import { fmtDate, yen } from "@/lib/format";
import { getStrings, isLocale } from "@/lib/i18n";
import { signOutAction } from "../auth/actions";
import { Logo } from "@/components/Logo";
import { ArrowLeftIcon } from "@/components/icons";
import { ProfileForm } from "@/components/account/ProfileForm";
import { OptInToggle } from "@/components/account/OptInToggle";
import { StatusPill } from "@/components/account/StatusPill";
import s from "@/components/checkout.module.css";
import a from "@/components/account.module.css";

/** The account page (PRD 2.3–2.6): orders, profile, notification preference, sign out. */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const me = await currentCustomer();
  if (!me) redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/account`)}`);
  const t = getStrings(locale);
  const home = `/${locale}`;
  const orders = await loadOrders(me.id, locale);
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
          <form action={signOut}><button type="submit" className={s.headerLink}>{t.signOut}</button></form>
        </div>
      </header>
      <div className={s.body}>
        <main className={s.main}>
          <div className={a.wrap}>
            <div className="stack" style={{ gap: 6 }}>
              <h1 className={`display ${s.h1sm}`}>{t.accountTitle}</h1>
              <p className={s.lead15}>{t.signedInAs(me.email)}</p>
            </div>

            <section className={a.block} aria-labelledby="orders-h">
              <div className={a.blockHead}><h2 id="orders-h" className={`display ${s.h2}`}>{t.yourOrders}</h2></div>
              {orders.length === 0 ? (
                <div className={a.empty}>
                  <div className="w9">{t.noOrdersTitle}</div>
                  <p className="small w7">{t.noOrdersBody}</p>
                  <Link href={home} className="btn btn-secondary raised">{t.backToShop}</Link>
                </div>
              ) : (
                orders.map((o) => (
                  <Link key={o.number} href={`${home}/account/orders/${encodeURIComponent(o.number)}`} className={`${a.card} ${a.cardLink}`}>
                    <div className={a.cardTop}>
                      <span className={a.num}>{o.number}</span>
                      <StatusPill locale={locale} status={o.status} />
                    </div>
                    <div className={a.meta}>{o.dropName} · {t.placedOn(fmtDate(o.placedAt, locale))}</div>
                    <div className={a.lines}>
                      {o.lines.map((l) => <div key={l.slug} className={a.line}><span>{l.name} × {l.qty}</span><span>{yen(l.lineTotal)}</span></div>)}
                      <div className={a.total}><span>{t.total}</span><span>{yen(o.total)}</span></div>
                    </div>
                  </Link>
                ))
              )}
            </section>

            <section className={a.block} aria-labelledby="notify-h">
              <h2 id="notify-h" className={`display ${s.h2}`}>{t.notificationsTitle}</h2>
              <OptInToggle locale={locale} initial={me.marketingOptIn} />
              <p className="small w7">{t.transactionalNote}</p>
            </section>

            <section className={a.block} aria-labelledby="profile-h">
              <h2 id="profile-h" className={`display ${s.h2}`}>{t.profileTitle}</h2>
              <p className="small w7">{t.profileNote}</p>
              <ProfileForm locale={locale} initial={{ name: me.name ?? "", phone: me.phone ?? "", locale: me.locale, postal: me.address?.postalCode ?? "", line1: me.address?.line1 ?? "", line2: me.address?.line2 ?? "" }} />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
