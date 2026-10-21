"use client";

import { useRef, type CSSProperties } from "react";
import type { Box, Locale } from "@/lib/data";
import { yen } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import { maxFor, useCart } from "@/lib/cart";
import { boop } from "@/lib/motion";
import { burst, flyTo } from "@/lib/particles";
import { StarburstShape } from "./icons";
import { AllergenChips } from "./AllergenChips";
import { BoxPhoto } from "./BoxPhoto";
import { ScrollLink } from "./ScrollLink";
import { Stepper } from "./Stepper";
import s from "./home.module.css";
import { qtyOf } from "@/lib/quantities";

/** At or below this many left, the "N left" sticker starts to throb. */
const LOW_STOCK = 3;

/** Box card while the drop is open: stepper + remaining count (PRD 1.3 / 3.1). */
export function BoxCard({ box, locale }: { box: Box; locale: Locale }) {
  const t = getStrings(locale);
  const cart = useCart();
  const qty = qtyOf(cart.qty, box.id);
  const soldOut = box.left === 0;
  const burstRef = useRef<HTMLDivElement>(null);
  // "+" throws crumbs, sends a cookie to the cart and nudges the "N left" sticker; "−" just drops a few crumbs.
  const fx = {
    inc: (button: HTMLButtonElement) => {
      burst(button, { kind: ["crumb", "crumb", "cookie"], count: 8 });
      flyTo(button);
      boop(burstRef.current, { rotate: 14, scale: 1.12 });
    },
    dec: (button: HTMLButtonElement) => burst(button, { kind: "crumb", count: 4, power: 180 }),
  };
  return (
    <article className={`card ${s.box}`} style={{ "--tilt": box.tilt } as CSSProperties}>
      <BoxPhoto box={box} placeholder={`${t.productPhoto} — ${box.name}`} />
      {!soldOut && (
        <div ref={burstRef} className={`${s.burst} ${box.left <= LOW_STOCK ? s.burstLow : ""}`} aria-hidden>
          <StarburstShape />
          <div className={s.burstText}>
            <span className={s.burstNum}>{box.left}</span>
            <span className={s.burstLabel}>{t.left}</span>
          </div>
        </div>
      )}
      {soldOut && <div className={s.stamp}>{t.soldOut}</div>}
      <div className={s.boxBody}>
        <div className={s.boxTitleRow}>
          <h3 className={`display ${s.boxName}`}>{box.name}</h3>
          <div className={s.boxPrice}>{yen(box.price)} <span className={s.tax}>{t.taxIncl}</span></div>
        </div>
        <p className={s.boxDesc}>{box.desc}</p>
        <p className={s.boxContents}>{box.contents}</p>
        <div className={s.allergens}>
          <span className={s.lab}>{t.contains}</span>
          <AllergenChips items={box.allergens.map((a) => ({ key: a, label: t.allergen(a) }))} />
        </div>
        {!soldOut ? (
          <div className={s.boxFoot}>
            <span className={s.howMany}>{t.howMany}</span>
            <span className="sr-only">{t.leftCount(box.left)}</span>
            <Stepper qty={qty} max={maxFor(box)} onInc={() => cart.inc(box.id)} onDec={() => cart.dec(box.id)} labels={{ inc: t.addOne, dec: t.removeOne }} fx={fx} />
          </div>
        ) : (
          <div className={s.soldNote}>{t.soldOutThisDrop} <ScrollLink href="#notify">{t.headsUpNextTime}</ScrollLink></div>
        )}
      </div>
    </article>
  );
}
