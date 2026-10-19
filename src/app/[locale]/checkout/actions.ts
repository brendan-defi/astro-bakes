"use server";

import { cookies } from "next/headers";
import { placeOrder, startCheckout, type PlaceInput, type PlaceResult, type StartInput, type StartResult } from "@/lib/checkout";

/** The cart row a browser is checking out, set when holds are taken and cleared when the order is placed. */
const COOKIE = "ab-cart";
const UUID = /^[0-9a-f-]{36}$/i;

async function cartIdFromCookie(): Promise<string | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  return v && UUID.test(v) ? v : null;
}

export async function startCheckoutAction(input: StartInput): Promise<StartResult> {
  const jar = await cookies();
  const res = await startCheckout(input, await cartIdFromCookie());
  if (res.ok && res.cartId) {
    jar.set(COOKIE, res.cartId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 });
  }
  return res;
}

export async function placeOrderAction(input: PlaceInput): Promise<PlaceResult> {
  const jar = await cookies();
  const res = await placeOrder(input, await cartIdFromCookie());
  if (res.ok) jar.delete(COOKIE);
  return res;
}
