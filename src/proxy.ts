import { NextResponse, type NextRequest } from "next/server";
import { adminHostAllowed, isAdminPath, requestHostname } from "@/lib/hosts";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // The admin portal answers only on its own host in production (PRD 4); requireAdmin checks again.
  if (isAdminPath(pathname)) {
    if (!adminHostAllowed(requestHostname(req.headers))) return new NextResponse("Not found", { status: 404 });
    return NextResponse.next();
  }
  // Locale lives in the URL and defaults from the browser (D2).
  if (pathname === "/") {
    const accept = req.headers.get("accept-language") ?? "";
    const locale = /^ja\b/i.test(accept.split(",")[0] ?? "") ? "ja" : "en";
    return NextResponse.redirect(new URL(`/${locale}`, req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/admin/:path*"] };
