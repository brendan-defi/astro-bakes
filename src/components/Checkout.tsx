"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { boxes, drop, sampleCustomer, sampleOrderNumber, settings, type Box, type Locale } from "@/lib/data";
import { fmtCountdown, fmtDate, fmtDateTime, yen } from "@/lib/format";
import { getStrings, type Strings } from "@/lib/i18n";
import { useCart, type CartLine } from "@/lib/cart";
import { lookupPostal, normalisePostal, type PostalHit } from "@/lib/postal";
import { clearHold, readHold, startHold } from "@/lib/hold";
import { ArrowLeftIcon, CardIcon, CheckIcon, ClockIcon, StarShape, TruckIcon, WarningIcon } from "./icons";
import { Logo } from "./Logo";
import { Stepper } from "./Stepper";
import { InfoStrip } from "./InfoStrip";
import s from "./checkout.module.css";

type Step = "cart" | "signin" | "code" | "delivery" | "pay" | "done";
const STEPS: Step[] = ["cart", "signin", "code", "delivery", "pay", "done"];
const STEP_INDEX: Partial<Record<Step, number>> = { signin: 1, code: 1, delivery: 2, pay: 3 };
const PREV: Partial<Record<Step, Step>> = { signin: "cart", code: "signin", delivery: "code", pay: "delivery" };

type Change = { kind: "gone"; box: Box; from: number } | { kind: "cut"; box: Box; from: number; to: number; left: number };

interface Address { name: string; phone: string; postal: string; line1: string; line2: string }
interface PlacedOrder { number: string; lines: { name: string; qty: number; lineTotal: number | null }[]; subtotal: number; total: number | null; email: string; address: Address; hit: PostalHit; gift: string | null }

const ORDER_KEY = "ab-last-order";

/** Render a template string with one bolded argument. */
function rich(template: (arg: string) => string, arg: string) {
  const [a, b] = template("\u0000").split("\u0000");
  return <>{a}<strong className="w9">{arg}</strong>{b}</>;
}
const plural = (name: string) => (name.endsWith("Box") ? `${name}es` : name);

export function Checkout({ locale }: { locale: Locale }) {
  const t = getStrings(locale);
  const cart = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const demo = sp.get("demo");
  const rawStep = sp.get("step") as Step | null;
  const step: Step = rawStep && STEPS.includes(rawStep) ? rawStep : "cart";
  const isCart = step === "cart";
  const idx = STEP_INDEX[step] ?? 0;
  const inCheckout = idx > 0;
  const home = `/${locale}`;

  const go = useCallback((to: Step) => {
    router.push(to === "cart" ? pathname : `${pathname}?step=${to}`);
    window.scrollTo({ top: 0 });
  }, [router, pathname]);

  // ---- inventory re-check (PRD 3.3 / 3.8) ----
  const [leftOverride, setLeftOverride] = useState<Record<string, number>>({});
  const [changes, setChanges] = useState<Change[] | null>(null);

  const leftFor = (b: Box) => leftOverride[b.id] ?? b.left;
  const maxFor = (b: Box) => Math.min(leftFor(b), b.maxPerCustomer);

  function onCheckout() {
    // Simulated server response for the re-check. Real build: POST /api/checkout → hold + Order(pending_payment).
    const inventory: Record<string, number> = demo === "soldout" ? { "cookie-box": 2, "banana-bread": 0 } : {};
    const found: Change[] = [];
    for (const line of cart.lines) {
      const left = inventory[line.box.id] ?? line.box.left;
      if (left === 0) { found.push({ kind: "gone", box: line.box, from: line.qty }); cart.set(line.box.id, 0); }
      else if (line.qty > left) { found.push({ kind: "cut", box: line.box, from: line.qty, to: left, left }); cart.set(line.box.id, left); }
    }
    if (found.length) {
      setLeftOverride(inventory);
      setChanges(found);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setChanges(null);
    startHold();
    go("signin");
  }

  // ---- hold countdown (D8) ----
  const [now, setNow] = useState(() => Date.now());
  const [holdExpires, setHoldExpires] = useState<number | null>(null);
  useEffect(() => {
    if (!inCheckout) return;
    let exp = readHold();
    if (!exp || exp < Date.now()) exp = startHold();
    setHoldExpires(exp);
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [inCheckout]);
  const holdLeft = holdExpires ? holdExpires - now : null;
  const holdExpired = inCheckout && holdLeft != null && holdLeft <= 0;

  // ---- sign in ----
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState<number | null>(null);
  useEffect(() => { if (step === "code") setResendAt(Date.now() + 30_000); }, [step]);
  const resendLeft = resendAt ? Math.max(0, resendAt - now) : 0;

  // ---- delivery ----
  const [addr, setAddr] = useState<Address>({ name: sampleCustomer.name, phone: sampleCustomer.phone, postal: sampleCustomer.postalCode, line1: sampleCustomer.line1, line2: sampleCustomer.line2 });
  const [hit, setHit] = useState<PostalHit | null>(() => lookupPostal(sampleCustomer.postalCode));
  const [postalTried, setPostalTried] = useState(true);
  const [gift, setGift] = useState(false);
  const [giftMsg, setGiftMsg] = useState("Happy birthday! Save one for me.");
  const [pay, setPay] = useState<"card" | "paypay">("card");
  const [touched, setTouched] = useState(false);

  function doLookup() {
    setPostalTried(true);
    setHit(lookupPostal(addr.postal));
  }
  const addrValid = addr.name.trim() && addr.phone.trim() && addr.line1.trim() && hit?.deliverable;
  const addressLine = hit ? `〒${addr.postal} ${hit.prefecture}${hit.city}${hit.town}${addr.line1}${addr.line2 ? " " + addr.line2 : ""}` : "";
  const shortAddress = hit ? `${hit.prefecture}${hit.city}${hit.town}${addr.line1}` : "";

  function submitDelivery(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!addrValid) return;
    go("pay");
  }

  // ---- place order ----
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  useEffect(() => {
    if (step !== "done" || placed) return;
    try { const raw = window.sessionStorage.getItem(ORDER_KEY); if (raw) setPlaced(JSON.parse(raw)); } catch {}
  }, [step, placed]);

  function placeOrder() {
    if (!hit) return;
    const order: PlacedOrder = {
      number: sampleOrderNumber,
      lines: cart.lines.map((l) => ({ name: l.box.name, qty: l.qty, lineTotal: l.lineTotal })),
      subtotal: cart.subtotal, total: cart.total, email: email || sampleCustomer.email,
      address: addr, hit, gift: gift ? giftMsg : null,
    };
    // Real build: order becomes paid only on the Stripe webhook (3.5).
    try { window.sessionStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch {}
    setPlaced(order);
    clearHold();
    cart.clear();
    go("done");
  }

  // ---- derived ----
  const shipLine = t.shipsArrives(fmtDate(drop.shipAt, locale), fmtDate(drop.arriveAt, locale));
  const shipLineYamato = t.shipsByYamato(fmtDate(drop.shipAt, locale), fmtDate(drop.arriveAt, locale));
  const feeLabel = yen(cart.shippingFee, "¥[fee]");
  const summaryLines = step === "done" && placed ? placed.lines : cart.lines.map((l) => ({ name: l.box.name, qty: l.qty, lineTotal: l.lineTotal }));
  const summarySubtotal = step === "done" && placed ? placed.subtotal : cart.subtotal;
  const summaryCount = summaryLines.reduce((n, l) => n + l.qty, 0);
  const summaryTotal = step === "done" && placed ? placed.total : cart.total;
  const totalLabel = yen(summaryTotal, "¥[total]");
  const placeLabel = pay === "card" ? t.placeOrderCard(totalLabel) : t.placeOrderPaypay;
  const backLabel = { signin: t.backToBoxes, code: t.useDifferentEmail, delivery: t.back, pay: t.backToDelivery }[step as "signin"] ?? t.back;
  const doneEmail = placed?.email || email || sampleCustomer.email;
  const doneName = placed?.address.name ?? addr.name;
  const doneAddr = placed ? `${placed.hit.prefecture}${placed.hit.city}${placed.hit.town}${placed.address.line1}` : shortAddress;

  const dotClass = (n: number) => `${s.dot} ${n < idx ? s.dotDone : n === idx ? s.dotCurrent : ""}`;
  const StepList = ({ cls }: { cls: string }) => (
    <ol aria-label={t.checkoutSteps} className={cls}>
      <li className={s.stepItem}><span className={dotClass(1)}>1</span>{t.stepSignIn}</li>
      <li aria-hidden className={s.dash} />
      <li className={s.stepItem}><span className={dotClass(2)}>2</span>{t.stepDelivery}</li>
      <li aria-hidden className={s.dash} />
      <li className={s.stepItem}><span className={dotClass(3)}>3</span>{t.stepPay}</li>
    </ol>
  );

  const holdChip = inCheckout && holdLeft != null && (
    <div className={`${s.hold} ${holdLeft < 60_000 ? s.holdLow : ""}`} aria-label={t.heldAria(fmtCountdown(holdLeft))} role="timer">
      <ClockIcon />
      <span className={s.holdLabel}>{t.held("").trim()}</span>{fmtCountdown(holdLeft)}
    </div>
  );

  const cancelNote = (
    <div className="note">
      <span className="w9">{t.cancelling}</span> {t.cancelPolicy(fmtDateTime(drop.closeAt, locale))}{" "}
      <a href={`${home}/legal/tokushoho`} className="w9">{t.tokushoho}</a>
    </div>
  );
  const agree = <p className={s.noteSmall}>{t.agreeTerms} <a href={`${home}/legal/terms`}>{t.termsLink}</a> {t.agreeTermsEnd}</p>;
  const lineNudge = (
    <div className={s.lineNudge}>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div className="w9">{t.lineNudgeTitle}</div>
        <div className="small w7">{t.lineNudgeSub}</div>
      </div>
      <a href={settings.lineUrl} className={s.lineNudgeBtn}>{t.addFriend}</a>
    </div>
  );

  return (
    <div className={s.page}>
      {/* ===== Header ===== */}
      <header className={s.header}>
        <div className={`container ${s.headerRow}`}>
          {isCart && <Link href={home} aria-label={t.backToShop} className={s.iconBtn}><ArrowLeftIcon /></Link>}
          {inCheckout && <button type="button" aria-label={t.back} onClick={() => go(PREV[step] ?? "cart")} className={s.iconBtn}><ArrowLeftIcon /></button>}
          {step === "done" && <span className={s.spacer} />}
          <Logo href={home} label={t.home} size="sm" />
          {inCheckout && <StepList cls={s.stepsTop} />}
          {holdChip}
          {!inCheckout && <span className={s.spacer} />}
          {isCart && <Link href={home} className={s.headerLink}><ArrowLeftIcon size={18} />{t.keepShopping}</Link>}
          {step === "done" && <Link href={home} className={s.headerLink}>{t.backToShop}</Link>}
        </div>
      </header>

      {inCheckout && <StepList cls={s.steps} />}

      {(step === "signin" || step === "code" || step === "delivery") && (
        <div className={s.pinned}>
          <div style={{ minWidth: 0 }}>
            <div className={s.l1}>{t.boxCount(cart.count)} · {yen(cart.subtotal)} <span className={s.sub13}>{t.plusShipping}</span></div>
            <div className={s.l2}>{shipLine}</div>
          </div>
          <TruckIcon />
        </div>
      )}

      <div className={s.body}>
        {/* ===== Main column ===== */}
        <main className={s.main}>
          {inCheckout && !holdExpired && (
            <button type="button" onClick={() => go(PREV[step] ?? "cart")} className={s.backBtn}><ArrowLeftIcon size={18} />{backLabel}</button>
          )}

          {holdExpired ? (
            <>
              <div role="alert" className="alert">
                <div className="alert-title"><WarningIcon /><div className={`display`} style={{ fontSize: 18, lineHeight: 1.15 }}>{t.holdExpiredTitle}</div></div>
                <div className="small w7" style={{ fontSize: 14 }}>{t.holdExpiredBody}</div>
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={() => { clearHold(); setHoldExpires(null); go("cart"); }}>{t.backToCart}</button>
            </>
          ) : (
            <>
              {/* ---- Cart ---- */}
              {isCart && (
                <CartStep t={t} cart={cart} changes={changes} maxFor={maxFor} shipLineYamato={shipLineYamato} feeLabel={feeLabel} totalLabel={totalLabel} onCheckout={onCheckout} home={home} demo={demo} />
              )}

              {/* ---- Sign in ---- */}
              {step === "signin" && (
                <div className={`stack ${s.narrow}`} style={{ gap: 16 }}>
                  <h1 className={`display ${s.h1sm}`}>{t.signInTitle}</h1>
                  <p className={s.lead}>{t.signInBody}</p>
                  <form className={s.form} onSubmit={(e) => { e.preventDefault(); if (email) go("code"); }}>
                    <label htmlFor="co-email" className="label">{t.emailAddress}</label>
                    <input id="co-email" type="email" required autoComplete="email" placeholder="you@example.com" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <button type="submit" className={`btn btn-primary ${s.selfStart}`} style={{ marginTop: 6 }}>{t.emailMeCode}</button>
                  </form>
                  <div className={s.inline}><CheckIcon />{t.cartStays}</div>
                </div>
              )}

              {/* ---- Code ---- */}
              {step === "code" && (
                <div className={`stack ${s.narrow}`} style={{ gap: 16 }}>
                  <h1 className={`display ${s.h1sm}`}>{t.checkEmail}</h1>
                  <p className={s.lead}>{rich(t.sentTo, email || sampleCustomer.email)}</p>
                  <form className={s.form} onSubmit={(e) => { e.preventDefault(); if (code.length === 6) go("delivery"); }}>
                    <label htmlFor="co-code" className="label">{t.sixDigit}</label>
                    <div className={s.codeRow}>
                      <input id="co-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className={`input ${s.codeInput}`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                      <button type="submit" className="btn btn-primary" disabled={code.length !== 6}>{t.continue}</button>
                    </div>
                  </form>
                  <div className={s.hideDesktop}><div className="note">{t.inAppTip}</div></div>
                  <div className={s.resendRow}>
                    <span>{t.didntGetIt}</span>
                    <button type="button" className={s.resendBtn} disabled={resendLeft > 0} onClick={() => setResendAt(Date.now() + 30_000)}>
                      {resendLeft > 0 ? t.resendIn(fmtCountdown(resendLeft)) : t.resend}
                    </button>
                    <span className={`${s.expires} ${s.hideMobile}`}>{t.expires}</span>
                  </div>
                  <p className={`${s.expires} ${s.hideDesktop}`}>{t.expires}</p>
                </div>
              )}

              {/* ---- Delivery ---- */}
              {step === "delivery" && (
                <div className="stack" style={{ gap: 16 }}>
                  <div className="stack" style={{ gap: 6 }}>
                    <h1 className={`display ${s.h1sm}`}>{t.whereTitle}</h1>
                    <p className={s.lead15}>{t.whereBody}</p>
                  </div>
                  <form className={s.form14} onSubmit={submitDelivery} noValidate>
                    <div className={s.fields}>
                      <div className="field">
                        <label htmlFor="co-name" className="label">{t.recipientName} <span className="ja" lang="ja">お名前</span></label>
                        <input id="co-name" type="text" autoComplete="name" required className={`input ${touched && !addr.name.trim() ? s.inputError : ""}`} value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} />
                      </div>
                      <div className="field">
                        <label htmlFor="co-phone" className="label">{t.phone} <span className="ja" lang="ja">電話番号</span></label>
                        <input id="co-phone" type="tel" autoComplete="tel" required className={`input ${touched && !addr.phone.trim() ? s.inputError : ""}`} value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} />
                        <span className="hint">{t.phoneHint}</span>
                      </div>
                      <div className="field">
                        <label htmlFor="co-postal" className="label">{t.postalCode} <span className="ja" lang="ja">郵便番号</span></label>
                        <div className={s.postalRow}>
                          <input id="co-postal" type="text" inputMode="numeric" autoComplete="postal-code" className="input" value={addr.postal}
                            onChange={(e) => { setAddr({ ...addr, postal: e.target.value }); setPostalTried(false); setHit(null); }}
                            onBlur={() => { if (normalisePostal(addr.postal).length === 7) doLookup(); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } }} />
                          <button type="button" className={s.lookupBtn} onClick={doLookup}>{t.lookUp}</button>
                        </div>
                      </div>
                      <div className={s.autofill}>
                        <div className={s.k}>{t.filledFrom}</div>
                        {hit ? (
                          <>
                            <div className={s.addr}>{hit.prefecture} {hit.city} {hit.town}</div>
                            {hit.deliverable
                              ? <div className={s.okPill}><CheckIcon size={15} strokeWidth={3} />{t.weDeliverTo(hit.wardEn)}</div>
                              : <div className={s.badPill}><WarningIcon size={15} />{t.outsideArea}</div>}
                          </>
                        ) : (
                          <div className={s.addr} style={{ opacity: postalTried ? 1 : 0.5 }}>{postalTried ? <span className={s.badPill}><WarningIcon size={15} />{t.postalNotFound}</span> : "—"}</div>
                        )}
                      </div>
                      <div className="field">
                        <label htmlFor="co-line1" className="label">{t.streetNumber} <span className="ja" lang="ja">番地</span></label>
                        <input id="co-line1" type="text" autoComplete="address-line1" required className={`input ${touched && !addr.line1.trim() ? s.inputError : ""}`} value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
                      </div>
                      <div className="field">
                        <label htmlFor="co-line2" className="label">{t.building} <span className="ja" lang="ja">建物名・部屋番号</span> <span className="ja">{t.optional}</span></label>
                        <input id="co-line2" type="text" autoComplete="address-line2" placeholder={t.buildingPlaceholder} className="input" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
                      </div>
                    </div>

                    <div className={s.mobileOnly}>
                      <InfoStrip align="start">
                        <div className="w9">{shipLine}</div>
                        <div className="small w7">{t.sameDayNote}</div>
                      </InfoStrip>
                    </div>

                    <label className={s.giftToggle}>
                      <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} />
                      {t.giftToggle}
                    </label>
                    {gift && (
                      <div className={`field ${s.giftField}`}>
                        <label htmlFor="co-gift" className="label">{t.giftLabel} <span className="ja">{t.giftHint}</span></label>
                        <textarea id="co-gift" rows={3} maxLength={150} className="input" value={giftMsg} onChange={(e) => setGiftMsg(e.target.value)} />
                        <span className={s.counter}>{giftMsg.length} / 150</span>
                      </div>
                    )}

                    <div className={s.continueRow}>
                      <button type="submit" className={`btn btn-primary ${s.selfStart}`} style={{ marginTop: 4 }}>{t.continueToPayment}</button>
                      <p className={s.noteSmall}>{t.saveAddressNote}</p>
                    </div>
                  </form>
                </div>
              )}

              {/* ---- Review & pay (最終確認画面) ---- */}
              {step === "pay" && (
                <div className="stack" style={{ gap: 16 }}>
                  <h1 className={`display ${s.h1sm}`}>{t.reviewTitle}</h1>

                  <div className={s.mobileOnly}>
                    <section aria-label={t.yourOrder} className={`${s.section} ${s.sectionRaised}`}>
                      <div className={s.sectionTitle}>{t.yourOrder}</div>
                      {cart.lines.map((l) => (
                        <div key={l.box.id} className={s.tr}>
                          <span>{l.box.name} <span className="w9">× {l.qty}</span> <span className={s.sub12}>({yen(l.box.price)} {t.each})</span></span>
                          <span className={s.v} style={{ whiteSpace: "nowrap" }}>{yen(l.lineTotal)}</span>
                        </div>
                      ))}
                      <div className={`${s.tr}`} style={{ borderTop: "2px dashed var(--ink)", paddingTop: 8, marginTop: 2 }}><span>{t.subtotal}</span><span className={s.v}>{yen(cart.subtotal)}</span></div>
                      <div className={s.tr}><span>{t.shipping}</span><span className={s.v}>{feeLabel}</span></div>
                      <div className={`${s.tr} ${s.trTotal}`} style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}><span className={s.k}>{t.total} <span className={s.sub12}>{t.taxIncl}</span></span><span className={s.v}>{totalLabel}</span></div>
                    </section>
                  </div>

                  <section aria-label={t.deliverTo} className={s.section}>
                    <div className={s.sectionHead}>
                      <div className={s.sectionTitle}>{t.deliverTo}</div>
                      <button type="button" onClick={() => go("delivery")} className={s.editBtn}>{t.edit}</button>
                    </div>
                    <div className="w9">{addr.name}</div>
                    <div style={{ fontSize: 15 }}>{addressLine}<br />{addr.phone}</div>
                    {gift && giftMsg && <div className={s.giftNote}><span className="w9">{t.giftCard}</span> {giftMsg}</div>}
                    <div className={s.shipLine}><TruckIcon size={20} />{shipLineYamato}</div>
                  </section>

                  <section aria-label={t.payWith} className={s.paySection}>
                    <div className={s.sectionTitle}>{t.payWith}</div>
                    <div className={s.payTiles}>
                      <button type="button" aria-pressed={pay === "card"} onClick={() => setPay("card")} className={`${s.tile} ${pay === "card" ? s.tileOn : ""}`}><CardIcon />{t.card}</button>
                      <button type="button" aria-pressed={pay === "paypay"} onClick={() => setPay("paypay")} className={`${s.tile} ${pay === "paypay" ? s.tileOn : ""}`}>{t.paypay}</button>
                    </div>
                    {pay === "card"
                      ? <div className={s.stripeBox}>{t.stripeElement}<span>{t.stripeElementSub}</span></div>
                      : <div className={s.paypayBox}><span className={s.mobileOnly}>{t.paypayMobile}</span><span className={s.desktopOnly}>{t.paypayDesktop}</span></div>}
                  </section>

                  <div className={s.mobileOnly}>
                    {cancelNote}
                    <button type="button" onClick={placeOrder} className="btn btn-primary btn-block" style={{ minHeight: 64 }}>{placeLabel}</button>
                    {agree}
                  </div>
                </div>
              )}

              {/* ---- Confirmation ---- */}
              {step === "done" && (
                <div className={s.doneContent}>
                  <section className={s.doneHero}>
                    <div className={s.doneAvatar}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/images/astro-cookie.jpg" alt={t.astroCookieAlt} />
                      <StarShape fill="var(--butter)" />
                    </div>
                    <div className={s.doneText}>
                      <h1 className={`display ${s.doneTitle}`}>{t.youreIn}</h1>
                      <p className={s.doneBody}>{t.confirmed(placed?.number ?? sampleOrderNumber, doneEmail)}</p>
                    </div>
                  </section>

                  <div className={s.mobileOnly}>
                    <section aria-label={t.yourOrder} className={`${s.section} ${s.sectionRaised}`} style={{ gap: 6 }}>
                      {summaryLines.map((l) => <div key={l.name} className={`${s.tr} w9`}><span>{l.name} × {l.qty}</span><span>{yen(l.lineTotal)}</span></div>)}
                      <div style={{ fontSize: 14, borderTop: "2px dashed var(--ink)", paddingTop: 8, marginTop: 4 }}>{t.toAddress(doneName, doneAddr)}</div>
                    </section>
                  </div>

                  <section aria-label={t.whatNext} className="stack" style={{ gap: 12 }}>
                    <h2 className={`display ${s.h2}`}>{t.whatNext}</h2>
                    <ol className={s.nextList}>
                      {[
                        { bg: "var(--pink)", date: fmtDate(drop.closeAt, locale), m: t.next1, d: t.dropCloses, sub: t.next1Sub },
                        { bg: "var(--butter)", date: null, m: t.next2, d: `${t.bakeDay}`, d2: t.allAtOnce, sub: t.next2Sub },
                        { bg: "var(--aqua)", date: fmtDate(drop.shipAt, locale), m: t.next3, d: t.shipsByYamatoShort, sub: t.next3Sub },
                        { bg: "var(--lilac)", date: fmtDate(drop.arriveAt, locale), m: t.next4, d: t.arrivesShort, sub: t.next4Sub(doneName) },
                      ].map((it, i) => (
                        <li key={i} className={s.nextItem}>
                          <span className={s.nextDot} style={{ background: it.bg }} />
                          <div>
                            <div className={s.nextTitle}>
                              <span className={s.mobileOnly}>{it.date ? `${it.date} · ${it.m}` : it.m}</span>
                              <span className={s.desktopOnly}>{it.date ?? it.d}<span className={s.lbl}>{it.date ? it.d : it.d2}</span></span>
                            </div>
                            <div className={s.nextSub}>{it.sub}</div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <div className={s.mobileOnly}>
                    <a href="#top" className={`btn btn-secondary btn-block ${s.viewOrder}`}>{t.viewOrder}</a>
                    <Link href={home} className={s.backLink}>{t.backToShop}</Link>
                    {lineNudge}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* ===== Desktop aside ===== */}
        <aside aria-label={t.orderSummary} className={s.aside}>
          <section className={s.summary}>
            <div className={s.sectionTitle}>{step === "done" ? t.yourOrder : isCart ? t.totalTitle : t.orderSummary}</div>
            {!isCart && summaryLines.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                {summaryLines.map((l) => <div key={l.name} className={s.tr}><span>{l.name} <span className="w9">× {l.qty}</span></span><span className={s.v} style={{ whiteSpace: "nowrap" }}>{yen(l.lineTotal)}</span></div>)}
              </div>
            )}
            <div className={`${s.tr} ${s.trSub}`}><span>{t.subtotal} · {t.boxCount(summaryCount)}</span><span className={s.v}>{yen(summarySubtotal)}</span></div>
            <div className={s.tr}><span>{t.shipping} <span className={s.sub13}>{t.shippingFlatShort}</span></span><span className={s.v}>{feeLabel}</span></div>
            <div className={`${s.tr} ${s.trTotal}`}><span className={s.k}>{t.total} <span className={s.sub12}>{t.taxIncl}</span></span><span className={s.v}>{totalLabel}</span></div>
            <div className={s.summaryStrip}><TruckIcon size={20} />{shipLine}</div>
          </section>

          {isCart && (
            <div className={s.asideBlock}>
              <button type="button" onClick={onCheckout} disabled={cart.count === 0} className="btn btn-primary btn-block" style={{ minHeight: 64, fontSize: 22 }}>{t.checkout}</button>
              <p className={s.asideNote}>{t.holdNote}</p>
            </div>
          )}
          {step === "pay" && !holdExpired && (
            <div className={s.asideBlock} style={{ gap: 14 }}>
              {cancelNote}
              <button type="button" onClick={placeOrder} className="btn btn-primary btn-block" style={{ minHeight: 66 }}>{placeLabel}</button>
              {agree}
            </div>
          )}
          {step === "done" && (
            <div className={s.asideBlock} style={{ gap: 12 }}>
              <div className="w7" style={{ fontSize: 15 }}>{t.toAddress(doneName, doneAddr)}</div>
              <a href="#top" className={`btn btn-secondary btn-block ${s.viewOrder}`}>{t.viewOrder}</a>
              {lineNudge}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ---------------- Cart step ---------------- */
function CartStep({ t, cart, changes, maxFor, shipLineYamato, feeLabel, totalLabel, onCheckout, home, demo }: {
  t: Strings; cart: ReturnType<typeof useCart>; changes: Change[] | null; maxFor: (b: Box) => number;
  shipLineYamato: string; feeLabel: string; totalLabel: string; onCheckout: () => void; home: string; demo: string | null;
}) {
  const gone = changes?.filter((c): c is Extract<Change, { kind: "gone" }> => c.kind === "gone") ?? [];
  const rows: CartLine[] = cart.lines;
  const empty = cart.hydrated && rows.length === 0 && gone.length === 0;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <h1 className={`display ${s.h1}`}>{t.yourBoxes}</h1>

      {changes && changes.length > 0 && (
        <div role="alert" className="alert">
          <div className="alert-title"><WarningIcon /><div className="display">{t.recheckTitle}</div></div>
          <ul>
            {changes.map((c, i) => (
              <li key={i}>
                {c.kind === "gone"
                  ? rich(t.recheckGone, c.box.name)
                  : rich((n) => t.recheckCut(c.left, n, c.from, c.to), plural(c.box.name))}
              </li>
            ))}
          </ul>
          <div className="w7" style={{ fontSize: 14 }}>{t.recheckFooter}</div>
        </div>
      )}

      {demo === "soldout" && !changes && <p className={s.demoHint}>{t.demoSoldOutHint}</p>}

      {empty ? (
        <div className={s.empty}>
          <div className="display" style={{ fontSize: 22 }}>{t.emptyTitle}</div>
          <p className="w7" style={{ fontSize: 14 }}>{t.emptyBody}</p>
          <Link href={`${home}#boxes`} className="btn btn-secondary raised">{t.pickYourBoxes}</Link>
        </div>
      ) : (
        <div className={s.rows}>
          {rows.map((l) => (
            <div key={l.box.id} className={s.row}>
              <div className={s.thumb} style={{ background: l.box.tint }}>Photo</div>
              <div className={s.rowBody}>
                <div className={s.rowTop}>
                  <div className={s.rowName}>{l.box.name}</div>
                  <div className={s.rowLine}>{yen(l.lineTotal)}</div>
                </div>
                <div className={s.rowBottom}>
                  <span className={s.rowUnit}>{yen(l.box.price)} {t.each} <span className={s.sub12}>{t.taxIncl}</span></span>
                  <span className={s.mobileOnly}>
                    <Stepper size="sm" qty={l.qty} max={maxFor(l.box)} onInc={() => cart.set(l.box.id, Math.min(maxFor(l.box), l.qty + 1))} onDec={() => cart.dec(l.box.id)} labels={{ inc: t.addOne, dec: t.removeOne }} />
                  </span>
                </div>
              </div>
              <span className={s.desktopOnly}>
                <Stepper qty={l.qty} max={maxFor(l.box)} onInc={() => cart.set(l.box.id, Math.min(maxFor(l.box), l.qty + 1))} onDec={() => cart.dec(l.box.id)} labels={{ inc: t.addOne, dec: t.removeOne }} />
              </span>
              <div className={s.rowLineDesk}>{yen(l.lineTotal)}</div>
            </div>
          ))}
          {gone.map((c) => (
            <div key={c.box.id} className={`${s.row} ${s.rowGone}`}>
              <div className={s.thumb} style={{ background: c.box.tint }}>Photo</div>
              <div className={s.rowBody}>
                <div className={s.rowTop}>
                  <div className={s.rowName}>{c.box.name}</div>
                  <span className={`${s.soldTag} ${s.hideDesktop}`}>{t.soldOut}</span>
                </div>
                <a href={`${home}#notify`} className="w9" style={{ fontSize: 13 }}>{t.headsUpNextDrop}</a>
              </div>
              <span className={`${s.soldTag} ${s.hideMobile}`}>{t.soldOut}</span>
            </div>
          ))}
        </div>
      )}

      <p className={s.limitNote}>{t.limitNote}</p>

      <div className={s.mobileOnly}>
        <div className={s.totals}>
          <div className={s.tr}><span>{t.subtotal}</span><span className={s.v}>{yen(cart.subtotal)}</span></div>
          <div className={s.tr}><span>{t.shipping} <span className={s.sub13}>{t.shippingFlat}</span></span><span className={s.v}>{feeLabel}</span></div>
          <div className={`${s.tr} ${s.trTotal}`}><span className={s.k}>{t.total} <span className={s.sub12}>{t.taxIncl}</span></span><span className={s.v}>{totalLabel}</span></div>
        </div>
        <InfoStrip><span>{shipLineYamato}</span></InfoStrip>
        <button type="button" onClick={onCheckout} disabled={cart.count === 0} className="btn btn-primary btn-block" style={{ minHeight: 62, fontSize: 21 }}>{t.checkout}</button>
        <p className={s.primaryNote}>{t.holdNote}</p>
      </div>
    </div>
  );
}
