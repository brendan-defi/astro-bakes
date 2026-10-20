import type { Locale, Settings } from "@/lib/data";
import { yen } from "@/lib/format";
import { getStrings } from "@/lib/i18n";
import s from "./home.module.css";

export function HowItWorks({ locale, settings }: { locale: Locale; settings: Settings }) {
  const t = getStrings(locale);
  const steps = [
    { n: 1, bg: "var(--pink)", title: t.how1Title, body: t.how1Body, tilt: "rotate(-1deg)", tiltD: "rotate(-1.5deg)" },
    { n: 2, bg: "var(--aqua)", title: t.how2Title, body: t.how2Body, tilt: "rotate(1deg)", tiltD: "rotate(1deg) translateY(14px)" },
    { n: 3, bg: "var(--lilac)", title: t.how3Title, body: t.how3Body, tilt: "rotate(-1deg)", tiltD: "rotate(-1deg)" },
  ];
  return (
    <section id="how" className={s.how}>
      <div className={`container ${s.howInner}`}>
        <div className={s.howHead}>
          <div className="eyebrow">{t.newHere}</div>
          <h2 className="display h2">{t.howTitle}</h2>
        </div>
        <ol className={s.steps}>
          {steps.map((st) => (
            <li key={st.n} className={s.step} style={{ transform: st.tilt }}>
              <span className={s.stepNum} style={{ background: st.bg }}>{st.n}</span>
              <div>
                <div className={s.stepTitle}>{st.title}</div>
                <div className={s.stepBody}>{st.body}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className={s.chips}>
          <span className="chip">{t.chipArea}</span>
          <span className="chip">{settings.shippingFee === 0 ? t.chipShippingIncluded : t.chipShipping(yen(settings.shippingFee, "¥[fee]"))}</span>
          <span className="chip">{t.chipCancel}</span>
        </div>
      </div>
    </section>
  );
}
