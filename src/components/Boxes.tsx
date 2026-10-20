import type { CSSProperties } from "react";
import type { Box, Drop, HomeData, Locale } from "@/lib/data";
import { fmtDateTime, yen } from "@/lib/format";
import { getStrings, type Strings } from "@/lib/i18n";
import { ClockIcon } from "./icons";
import { AllergenChips } from "./AllergenChips";
import { BoxCard } from "./BoxCard";
import { BoxPhoto } from "./BoxPhoto";
import s from "./home.module.css";

/** Boxes: the ordering UI while open, otherwise the menu (PRD 1.3). */
export function Boxes({ locale, home }: { locale: Locale; home: HomeData }) {
  const t = getStrings(locale);
  const { state, drop, nextDrop, boxes } = home;
  const open = state === "open";
  // The drop these boxes belong to, when one is coming up.
  const upcoming = state === "scheduled" ? drop : state === "closed" ? nextDrop : null;
  const title = open ? t.inThisDrop : upcoming ? t.comingIn(t.dropN(upcoming.number)) : t.theMenu;
  const sub = open || upcoming ? t.boxesSub : t.menuSub;
  return (
    <section id="boxes" className={s.boxes}>
      <div className={`container ${s.boxesInner}`}>
        <div className={s.boxesHead}>
          <h2 className="display h2">{title}</h2>
          <p className={s.boxesSub}>{sub}</p>
        </div>
        <div className={s.boxGrid}>
          {boxes.map((b) => open ? <BoxCard key={b.id} box={b} locale={locale} /> : <MenuCard key={b.id} box={b} upcoming={upcoming} locale={locale} t={t} />)}
        </div>
      </div>
    </section>
  );
}

/** Box card when no drop is open: no stepper, no stock, just when ordering opens. */
function MenuCard({ box, upcoming, locale, t }: { box: Box; upcoming: Drop | null; locale: Locale; t: Strings }) {
  return (
    <article className={`card ${s.box}`} style={{ "--tilt": box.tilt } as CSSProperties}>
      <BoxPhoto box={box} placeholder={`${t.productPhoto} — ${box.name}`}>
        <span className={`${s.boxTag} ${upcoming ? s.boxTagButter : ""}`}>{upcoming ? t.inNextDrop : t.backNextDrop}</span>
      </BoxPhoto>
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
        <div className={s.menuFoot}>
          <ClockIcon size={18} />
          {upcoming ? t.orderFrom(fmtDateTime(upcoming.openAt, locale)) : t.orderingOpensNext}
        </div>
      </div>
    </article>
  );
}
