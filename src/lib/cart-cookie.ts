import "server-only";
import { cookies } from "next/headers";

/** The cart row a browser is checking out, set when holds are taken and cleared when the order is placed. */
export const CART_COOKIE = "ab-cart";
const UUID = /^[0-9a-f-]{36}$/i;

export async function cartIdFromCookie(): Promise<string | null> {
  const v = (await cookies()).get(CART_COOKIE)?.value;
  return v && UUID.test(v) ? v : null;
}
