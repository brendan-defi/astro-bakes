import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { customerForSession } from "./auth";
import { adminHostAllowed, requestHostname } from "./hosts";
import { readAdminSessionToken } from "./session-cookie";

/**
 * The admin portal's gate (PRD 4, 5.4). Every admin page, server action and
 * route handler calls `requireAdmin()` itself: layouts don't re-run on
 * navigation and server actions can be posted to any path, so neither the
 * layout nor the proxy is a boundary. `src/app/admin/guard.test.ts` fails
 * the build's tests when one doesn't.
 */

export interface Admin {
  id: string;
  email: string;
  name: string | null;
}

/** 404 unless this host may serve the admin portal (admin.astrobakes.xyz in production; anywhere on previews and locally). */
export async function assertAdminHost(): Promise<void> {
  if (!adminHostAllowed(requestHostname(await headers()))) notFound();
}

/** The signed-in admin, from the admin session cookie; null when signed out or no longer an admin. */
export async function currentAdmin(): Promise<Admin | null> {
  const c = await customerForSession(await readAdminSessionToken(), "admin");
  return c && c.role === "admin" ? { id: c.id, email: c.email, name: c.name } : null;
}

/** The signed-in admin, or off to the admin sign-in page. */
export async function requireAdmin(): Promise<Admin> {
  await assertAdminHost();
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/sign-in");
  return admin;
}
