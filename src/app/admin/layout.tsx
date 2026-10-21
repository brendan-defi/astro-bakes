import type { Metadata, Viewport } from "next";
import { fontVariables } from "../fonts";
import "../globals.css";

/**
 * Root layout of the admin portal (PRD 4), beside the shop's `[locale]` root
 * layout. Desktop-only and English-only (D25); kept out of search. Not an auth
 * boundary: each page and action calls requireAdmin itself.
 */
export const metadata: Metadata = {
  title: { default: "Admin · Astro Bakes", template: "%s · Admin · Astro Bakes" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#2a1b5e" };

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
