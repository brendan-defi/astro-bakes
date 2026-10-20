import Image from "next/image";
import type { Locale, Settings } from "@/lib/data";
import { getStrings } from "@/lib/i18n";
import { InstagramIcon, PawIcon } from "./icons";
import s from "./home.module.css";

export function Story({ locale, settings }: { locale: Locale; settings: Settings }) {
  const t = getStrings(locale);
  // The photo grid (PRD 1.4). Square crops; size is the source's pixel width.
  const polaroids = [
    { src: "/images/astro-outside.jpg", size: 271, alt: t.astroOutsideAlt, caption: t.capQC, className: s.p1 },
    { src: "/images/story/gooey.jpg", size: 1024, alt: t.gooeyAlt, caption: t.capGooey, className: s.p2 },
    { src: "/images/story/matcha.jpg", size: 1024, alt: t.matchaAlt, caption: t.capMatcha, className: s.p3 },
    { src: "/images/story/bake-day.jpg", size: 1024, alt: t.bakeDayAlt, caption: t.capBake, className: s.p4 },
  ];
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
          {polaroids.map((p) => (
            <figure key={p.src} className={`${s.polaroid} ${p.className}`}>
              <Image src={p.src} alt={p.alt} width={p.size} height={p.size} sizes="(min-width: 768px) 200px, 45vw" />
              <figcaption>{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
