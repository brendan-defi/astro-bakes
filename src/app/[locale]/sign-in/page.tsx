import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { currentCustomer } from "@/lib/auth";
import { signInDestination } from "@/lib/auth-rules";
import { isLocale } from "@/lib/i18n";
import { privatePage, stringsFor } from "@/lib/metadata";
import { SignIn } from "@/components/SignIn";

type Query = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return privatePage(stringsFor(locale).signIn);
}

export default async function SignInPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const next = signInDestination(one("next"), locale);
  // Someone already signed in skips this page. Except when this render is the code check's own: setting the session
  // cookie in that Server Action re-renders the page, and the client wants to play its "you're in" moment before moving
  // on itself. (Next marks action requests with this header; without it we'd just redirect straight away, as before.)
  const fromAction = (await headers()).has("next-action");
  if (!fromAction && (await currentCustomer())) redirect(next);
  return <SignIn locale={locale} next={next} error={one("error") ?? null} />;
}
