import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { currentCustomer } from "@/lib/auth";
import { safeNext } from "@/lib/auth-rules";
import { isLocale } from "@/lib/i18n";
import { SignIn } from "@/components/SignIn";

type Query = Record<string, string | string[] | undefined>;

export default async function SignInPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const next = safeNext(one("next"), `/${locale}/account`);
  if (await currentCustomer()) redirect(next);
  return <SignIn locale={locale} next={next} error={one("error") ?? null} />;
}
