import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminSignIn } from "@/components/admin/AdminSignIn";
import { assertAdminHost, currentAdmin } from "@/lib/admin";
import { adminNext } from "@/lib/auth-rules";

export const metadata: Metadata = { title: "Sign in" };

/** The admin portal's sign-in (PRD 5.4). Public, so it checks the host itself instead of calling requireAdmin. */
export default async function AdminSignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  await assertAdminHost();
  const { next: nextParam, error } = await searchParams;
  const next = adminNext(nextParam);
  // Already signed in: go on, unless this render is a server action's (its response must not redirect).
  if ((await currentAdmin()) && !(await headers()).has("next-action")) redirect(next);
  return <AdminSignIn next={next} error={error ?? null} />;
}
