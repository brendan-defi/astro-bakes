import { NextResponse, type NextRequest } from "next/server";

// Locale lives in the URL and defaults from the browser (D2).
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/") {
    const accept = req.headers.get("accept-language") ?? "";
    const locale = /^ja\b/i.test(accept.split(",")[0] ?? "") ? "ja" : "en";
    return NextResponse.redirect(new URL(`/${locale}`, req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
