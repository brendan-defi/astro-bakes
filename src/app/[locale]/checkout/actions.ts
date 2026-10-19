"use server";

import { cookies } from "next/headers";
import { currentCustomer } from "@/lib/auth";
import { CART_COOKIE, cartIdFromCookie } from "@/lib/cart-cookie";
import { placeOrder, startCheckout, type PlaceInput, type PlaceResult, type StartInput, type StartResult } from "@/lib/checkout";

export async function startCheckoutAction(input: StartInput): Promise<StartResult> {
  const jar = await cookies();
  const res = await startCheckout(input, await cartIdFromCookie());
  if (res.ok && res.checkoutId) {
    jar.set(CART_COOKIE, res.checkoutId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 });
  }
  return res;
}

export async function placeOrderAction(input: PlaceInput): Promise<PlaceResult> {
  const jar = await cookies();
  const me = await currentCustomer();
  const res = await placeOrder(input, await cartIdFromCookie(), me?.id ?? null);
  if (res.ok) jar.delete(CART_COOKIE);
  return res;
}
