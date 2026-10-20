import type { Box, Drop, HomeData, Locale } from "@/lib/data";
import { fmtDateTime, yen } from "@/lib/format";
import { getStrings, type Strings } from "@/lib/i18n";
import { CameraIcon, ClockIcon } from "./icons";
import { BoxCard } from "./BoxCard";
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
    <article className={`card ${s.box}`} style={{ transform: `rotate(${box.tilt})` }}>
      <div className={s.boxPhoto} style={{ background: box.tint }}>
        <CameraIcon />
        <span>{t.productPhoto} — {box.name}</span>
        <span className={`${s.boxTag} ${upcoming ? s.boxTagButter : ""}`}>{upcoming ? t.inNextDrop : t.backNextDrop}</span>
      </div>
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
        <div className={s.menuFoot}>
          <ClockIcon size={18} />
          {upcoming ? t.orderFrom(fmtDateTime(upcoming.openAt, locale)) : t.orderingOpensNext}
        </div>
      </div>
    </article>
  );
}
