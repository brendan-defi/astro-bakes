"use client";

import type { CSSProperties } from "react";
import type { Box, Locale } from "@/lib/data";
import { yen } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import { maxFor, useCart } from "@/lib/cart";
import { StarburstShape } from "./icons";
import { BoxPhoto } from "./BoxPhoto";
import { Stepper } from "./Stepper";
import s from "./home.module.css";

/** Box card while the drop is open: stepper + remaining count (PRD 1.3 / 3.1). */
export function BoxCard({ box, locale }: { box: Box; locale: Locale }) {
  const t = getStrings(locale);
  const cart = useCart();
  const qty = cart.qty[box.id] ?? 0;
  const soldOut = box.left === 0;
  return (
    <article className={`card ${s.box}`} style={{ "--tilt": box.tilt } as CSSProperties}>
      <BoxPhoto box={box} placeholder={`${t.productPhoto} — ${box.name}`} />
      {!soldOut && (
        <div className={s.burst} aria-hidden>
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
          {box.allergens.map((a) => <span key={a} className="chip-sm">{t.allergen(a)}</span>)}
        </div>
        {!soldOut ? (
          <div className={s.boxFoot}>
            <span className={s.howMany}>{t.howMany}</span>
            <span className="sr-only">{t.leftCount(box.left)}</span>
            <Stepper qty={qty} max={maxFor(box)} onInc={() => cart.inc(box.id)} onDec={() => cart.dec(box.id)} labels={{ inc: t.addOne, dec: t.removeOne }} />
          </div>
        ) : (
          <div className={s.soldNote}>{t.soldOutThisDrop} <a href="#notify">{t.headsUpNextTime}</a></div>
        )}
      </div>
    </article>
  );
}
