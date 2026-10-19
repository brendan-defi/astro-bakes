"use client";

import { boxes, type Box, type Locale } from "@/lib/data";
import { yen } from "@/lib/format";
import { getStrings, type Strings } from "@/lib/i18n";
import { maxFor, useCart } from "@/lib/cart";
import { CameraIcon, StarburstShape } from "./icons";
import { Stepper } from "./Stepper";
import s from "./home.module.css";

export function Boxes({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  return (
    <section id="boxes" className={s.boxes}>
      <div className={`container ${s.boxesInner}`}>
        <div className={s.boxesHead}>
          <h2 className="display h2">{t.inThisDrop}</h2>
          <p className={s.boxesSub}>{t.boxesSub}</p>
        </div>
        <div className={s.boxGrid}>
          {boxes.map((b) => <BoxCard key={b.id} box={b} t={t} />)}
        </div>
      </div>
    </section>
  );
}

function BoxCard({ box, t }: { box: Box; t: Strings }) {
  const cart = useCart();
  const qty = cart.qty[box.id] ?? 0;
  const soldOut = box.left === 0;
  return (
    <article className={`card ${s.box}`} style={{ transform: `rotate(${box.tilt})` }}>
      <div className={s.boxPhoto} style={{ background: box.tint }}>
        <CameraIcon />
        <span>{t.productPhoto} — {box.name}</span>
      </div>
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
          {box.allergens.map((a) => <span key={a} className="chip-sm">{a}</span>)}
        </div>
        {!soldOut ? (
          <div className={s.boxFoot}>
            <span className={s.howMany}>{t.howMany}</span>
            <span className="sr-only">{box.left} {t.left}</span>
            <Stepper qty={qty} max={maxFor(box)} onInc={() => cart.inc(box.id)} onDec={() => cart.dec(box.id)} labels={{ inc: t.addOne, dec: t.removeOne }} />
          </div>
        ) : (
          <div className={s.soldNote}>{t.soldOutThisDrop} <a href="#notify">{t.headsUpNextTime}</a></div>
        )}
      </div>
    </article>
  );
}
