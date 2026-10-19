"use client";

import Link from "next/link";
import type { Locale } from "@/lib/data";
import { yen } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { useDemoQuery } from "@/lib/demo-query";
import s from "./home.module.css";

export function CartBar({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  const { count, subtotal, shippingFee, hydrated } = useCart();
  const demoQuery = useDemoQuery();
  if (!hydrated || count === 0) return null;
  return (
    <div id="cart" className={s.cartBar}>
      <Link href={`/${locale}/checkout${demoQuery}`} className={s.cartLink}>
        <span>
          {t.boxCount(count)} · {yen(subtotal)}{" "}
          <span className={s.fee}>{t.shippingSuffix(yen(shippingFee, "¥[fee]"))}</span>
        </span>
        <span className={s.go}>{t.checkout}</span>
      </Link>
    </div>
  );
}
