import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { currentCustomer } from "@/lib/auth";
import { signInDestination } from "@/lib/auth-rules";
import { isLocale } from "@/lib/i18n";
import { SignIn } from "@/components/SignIn";

type Query = Record<string, string | string[] | undefined>;

export default async function SignInPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const next = signInDestination(one("next"), locale);
  if (await currentCustomer()) redirect(next);
  return <SignIn locale={locale} next={next} error={one("error") ?? null} />;
}
