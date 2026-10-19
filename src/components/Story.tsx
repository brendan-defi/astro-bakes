import type { Locale, Settings } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { InstagramIcon, PawIcon } from "./icons";
import s from "./home.module.css";

export function Story({ locale, settings }: { locale: Locale; settings: Settings }) {
  const t = getStrings(locale);
  return (
    <section id="story" className={s.story}>
      <div className={`container ${s.storyInner}`}>
        <div className={s.storyText}>
          <div className={s.storyEyebrow}>
            <PawIcon />
            <span className="eyebrow">{t.bakedIn}</span>
          </div>
          <h2 className="display h2">{t.meetAstro}</h2>
          <p className={s.storyLead}>{t.story1}</p>
          <p>{t.story2}</p>
          <p>{t.story3}</p>
          <a href={settings.instagramUrl} className={`btn btn-secondary ${s.igBtn}`} target="_blank" rel="noreferrer">
            <InstagramIcon />
            {t.moreOnInstagram}
          </a>
        </div>
        <div className={s.polaroids}>
          <figure className={`${s.polaroid} ${s.p1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/astro-outside.jpg" alt={t.astroOutsideAlt} />
            <figcaption>{t.capQC}</figcaption>
          </figure>
          <figure className={`${s.polaroid} ${s.p2}`}>
            <div className={s.polaroidPh} style={{ background: "var(--butter-soft)" }}>{t.phGooey}</div>
            <figcaption>{t.capGooey}</figcaption>
          </figure>
          <figure className={`${s.polaroid} ${s.p3}`}>
            <div className={s.polaroidPh} style={{ background: "#d5f5f4" }}>{t.phLoaf}</div>
            <figcaption>{t.capLoaf}</figcaption>
          </figure>
          <figure className={`${s.polaroid} ${s.p4}`}>
            <div className={s.polaroidPh} style={{ background: "var(--lilac-tint)" }}>{t.phTrays}</div>
            <figcaption>{t.capBake}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
