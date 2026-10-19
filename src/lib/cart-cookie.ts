import "server-only";
import { cookies } from "next/headers";
import { isUuid } from "./uuid";

/** The cart row a browser is checking out, set when holds are taken and cleared when the order is placed. */
export const CART_COOKIE = "ab-cart";

/** A cookie that isn't a strict UUID counts as no cart, so it can never reach a uuid cast in SQL. */
export async function cartIdFromCookie(): Promise<string | null> {
  const v = (await cookies()).get(CART_COOKIE)?.value;
  return isUuid(v) ? v : null;
}
