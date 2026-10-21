import { unsubscribe, verifyUnsubscribe } from "@/lib/unsubscribe";

/**
 * One-click unsubscribe (RFC 8058): mail clients POST to the List-Unsubscribe URL with the body
 * "List-Unsubscribe=One-Click", without cookies, so the signed `e`/`t` values are the only credential.
 * A GET (someone opened the URL in a browser) goes to the confirm page and changes nothing.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const email = verifyUnsubscribe(url.searchParams.get("e"), url.searchParams.get("t"));
  if (!email) return new Response("This unsubscribe link isn't valid.", { status: 400, headers: { "Cache-Control": "no-store" } });
  await unsubscribe(email);
  return new Response("Unsubscribed from Astro Bakes drop emails.", { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = url.searchParams.get("l") === "ja" ? "ja" : "en";
  const page = new URL(`/${locale}/unsubscribe`, url);
  for (const k of ["e", "t"]) {
    const v = url.searchParams.get(k);
    if (v) page.searchParams.set(k, v);
  }
  return Response.redirect(page, 303);
}
