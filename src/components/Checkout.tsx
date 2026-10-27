"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Box, Locale } from "@/lib/data";
import { placeOrderAction, startCheckoutAction } from "@/app/[locale]/checkout/actions";
import { useSignInFlow } from "@/lib/use-sign-in";
import { demoEnabled } from "@/lib/demo";
import { fmtCountdown, fmtDate, fmtDateTime, yen } from "@/lib/format";
import { getStrings, type Strings } from "@/lib/i18n";
import { useCart, type CartLine } from "@/lib/cart";
import { cleanPhoneInput, normalisePhone } from "@/lib/phone";
import { cleanPostalInput, lookupPostal, normalisePostal, outsideWards, type PostalHit } from "@/lib/postal";
import { clearHold, readHold, startHold, useHold } from "@/lib/hold";
import { useStored, writeStored } from "@/lib/stored";
import { celebrate } from "@/lib/particles";
import { formatReservationRef, parseReservationRef, reservationStatus, reservedLines, totals, type Reservation } from "@/lib/reservation";
import { CleanInput } from "./CleanInput";
import { CodeInput } from "./CodeInput";
import { ArrowLeftIcon, CameraIcon, CardIcon, CheckIcon, ClockIcon, StarShape, TruckIcon, WarningIcon } from "./icons";
import { Logo } from "./Logo";
import { Stepper } from "./Stepper";
import { InfoStrip } from "./InfoStrip";
import { SlotOptions } from "./SlotOptions";
import type { DeliverySlot } from "@/lib/delivery-slots";
import s from "./checkout.module.css";

type Step = "cart" | "signin" | "code" | "delivery" | "pay" | "done";
const STEPS: Step[] = ["cart", "signin", "code", "delivery", "pay", "done"];
const STEP_INDEX: Partial<Record<Step, number>> = { signin: 1, code: 1, delivery: 2, pay: 3 };
const PREV: Partial<Record<Step, Step>> = { signin: "cart", code: "signin", delivery: "code", pay: "delivery" };

type Change = { kind: "gone"; box: Box; from: number } | { kind: "cut"; box: Box; from: number; to: number; left: number };

interface Address { name: string; phone: string; postal: string; line1: string; line2: string }
// timeSlot is optional: an order cached in this tab before slots existed has none.
interface PlacedOrder { number: string; lines: { name: string; qty: number; lineTotal: number }[]; subtotal: number; total: number; email: string; address: Address; hit: PostalHit; gift: string | null; timeSlot?: DeliverySlot }

/** The open drop being sold, from the server. Dates are ISO strings so the page can pass them to this client component. */
export interface CheckoutDrop { id: string; number: number; name: string; closeAt: string; shipAt: string; arriveAt: string }
/** The signed-in customer's saved details, for prefill (PRD 2.3). */
export interface CheckoutCustomer { email: string; name: string; phone: string; postal: string; line1: string; line2: string }

/** The order this tab placed, in sessionStorage so the done step survives a reload. */
const ORDER_KEY = "ab-last-order";
function parsePlaced(raw: string | null): PlacedOrder | null {
  try { return raw ? (JSON.parse(raw) as PlacedOrder) : null; } catch { return null; }
}

/** Render a template string with one bolded argument. */
function rich(template: (arg: string) => string, arg: string) {
  const [a, b] = template("\u0000").split("\u0000");
  return <>{a}<strong className="w9">{arg}</strong>{b}</>;
}

export function Checkout({ locale, drop: dropIn, lineUrl, held, customer }: { locale: Locale; drop: CheckoutDrop | null; lineUrl: string; held: Reservation | null; customer: CheckoutCustomer | null }) {
  const t = getStrings(locale);
  // Dates for the summary; when no drop is open the cart step shows a closed notice instead.
  const drop = dropIn && { ...dropIn, closeAt: new Date(dropIn.closeAt), shipAt: new Date(dropIn.shipAt), arriveAt: new Date(dropIn.arriveAt) };
  const cart = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const demo = demoEnabled ? sp.get("demo") : null;
  const rawStep = sp.get("step") as Step | null;
  const step: Step = rawStep && STEPS.includes(rawStep) ? rawStep : "cart";
  const isCart = step === "cart";
  const idx = STEP_INDEX[step] ?? 0;
  const inCheckout = idx > 0;
  const home = `/${locale}`;
  // The address form is Japanese-format in both languages (D2); English labels carry the Japanese field name too.
  const jaHint = (label: string) => locale === "en" && <span className="ja" lang="ja">{label}</span>;

  const go = useCallback((to: Step, replace = false) => {
    // Keep the demo switches (?state=, ?demo=) across steps; they decide which drop the server sells outside production.
    const params = new URLSearchParams(sp.toString());
    if (to === "cart") { params.delete("step"); params.delete("r"); }
    else params.set("step", to);
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (replace) router.replace(url);
    else router.push(url);
    window.scrollTo({ top: 0 });
  }, [router, pathname, sp]);
  // Signed-in customers never see the email steps, so for them "back" from delivery is the cart.
  const prevOf = (from: Step): Step => (customer && (from === "delivery" || from === "code" || from === "signin") ? "cart" : PREV[from] ?? "cart");

  // ---- inventory re-check + hold (PRD 3.3 / 3.8, D8) ----
  const [leftOverride, setLeftOverride] = useState<Record<string, number>>({});
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Own properties only: a box slugged like an Object.prototype name ("constructor") mustn't read a function as its stock.
  // A missing override falls back to the page's count; an override of 0 (sold out on re-check) stands.
  const leftFor = (b: Box) => (Object.hasOwn(leftOverride, b.id) ? leftOverride[b.id] : b.left);
  const maxFor = (b: Box) => Math.min(leftFor(b), b.maxPerCustomer);

  async function onCheckout() {
    if (!drop || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await startCheckoutAction({ dropId: drop.id, items: cart.qty, flags: { state: sp.get("state"), demo } });
      if (!res.ok) {
        setNotice(res.error === "drop_closed" ? t.dropJustClosed : t.emptyTitle);
        return;
      }
      setLeftOverride(res.left);
      if (res.changes.length) {
        const byId = new Map(cart.lines.map((l) => [l.box.id, l.box]));
        const found: Change[] = [];
        for (const c of res.changes) {
          const box = byId.get(c.box);
          if (!box) continue;
          found.push(c.kind === "gone" ? { kind: "gone", box, from: c.from } : { kind: "cut", box, from: c.from, to: c.to, left: c.left });
          cart.set(box.id, c.kind === "gone" ? 0 : c.to);
        }
        setChanges(found);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setChanges(null);
      setServerExpired(false);
      startHold({ expires: res.expiresAt ?? undefined, checkoutId: res.checkoutId, revision: res.revision });
      go("signin");
    } finally {
      setBusy(false);
    }
  }

  // ---- hold countdown (D8) ----
  const [now, setNow] = useState(() => Date.now());
  const hold = useHold();
  // Set when the server rejects the reservation, independent of what the local clock says.
  const [serverExpired, setServerExpired] = useState(false);
  // Another tab took or replaced the browser's reservation: this tab must review the cart (PRD 3.3).
  const leaveStale = useEffectEvent(() => {
    clearHold();
    setNotice(t.cartChanged);
    go("cart");
  });
  // This tab reserved, but the server no longer holds anything: expired or already ordered.
  const reservationGone = useEffectEvent(() => {
    clearHold();
    setServerExpired(true);
  });
  // Square this tab's hold with the server's reservation whenever a checkout step or the server's answer arrives, and
  // before paint, so an out-of-date saved hold never shows. Only then, not on every render: placing an order clears
  // the hold before the done step arrives, and that mustn't look like another tab taking the reservation.
  useLayoutEffect(() => {
    if (!inCheckout) return;
    let h = readHold();
    const status = reservationStatus(h, held, parseReservationRef(sp.get("r")));
    if (status === "adopt" && held) {
      // Opened from the sign-in email in a new tab: the link names this browser's own reservation, and it still matches.
      h = startHold({ expires: held.expiresAt, checkoutId: held.checkoutId, revision: held.revision });
    } else if (status === "stale") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- found on arrival (reload, Back, the email link): no handler to do it in
      leaveStale();
      return;
    }
    if (status === "none" && h?.checkoutId) {
      reservationGone();
      return;
    }
    if (status === "ok" && held) startHold({ ...h, expires: held.expiresAt });
    else if (!h || h.expires < Date.now()) startHold();
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [inCheckout, held, sp]);
  const holdLeft = hold != null ? hold.expires - now : null;
  const holdExpired = inCheckout && (serverExpired || (holdLeft != null && holdLeft <= 0));

  // ---- sign in (PRD 2.1; the magic link lands back here at the delivery step, naming this browser's reservation) ----
  const auth = useSignInFlow({
    locale,
    next: () => {
      const params = new URLSearchParams(sp.toString());
      params.set("step", "delivery");
      const h = readHold();
      if (h?.checkoutId && h.revision != null) params.set("r", formatReservationRef({ checkoutId: h.checkoutId, revision: h.revision }));
      return `${pathname}?${params}`;
    },
    onSignedIn: () => {
      router.refresh(); // pick up the session: the page re-renders with the customer and their saved details
      go("delivery", true);
    },
  });
  const email = auth.email;
  // Set while the customer's own way out of the code step is landing, by the back buttons (see `back`) or browser
  // history; whichever step it lands on clears it. Until then the signed-in skip below holds off, so it can't replace
  // the page they chose with delivery while that page loads. (History is caught here, during the event itself, ahead
  // of the sign-in flow's own reaction to it, which settles busy a moment later.)
  const leavingCode = useRef(false);
  useEffect(() => {
    leavingCode.current = false;
    if (step !== "code") return;
    const onHistory = () => { leavingCode.current = true; };
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, [step]);
  useEffect(() => {
    // Already signed in: the email steps don't apply, and shouldn't sit in history. Not while a code is being checked,
    // though: the session arrives with the check's re-render, and onSignedIn moves on once the "you're in" moment has
    // played (busy lasts through it). Nor while the customer's chosen step is still landing. Coming back to these steps
    // later skips them again.
    if (customer && (step === "signin" || step === "code")) {
      if (!auth.busy && !leavingCode.current) go("delivery", true);
    }
    // The code screen without an address to verify (storage cleared): back to the email field.
    else if (!customer && step === "code" && auth.hydrated && !auth.pending) go("signin", true);
  }, [customer, step, auth.hydrated, auth.pending, auth.busy, go]);
  // The back buttons. Leaving the code step while a code is being checked or celebrated drops that attempt, which would
  // otherwise move the customer on to delivery afterwards, and holds the signed-in skip until their step has landed.
  const back = () => {
    if (step === "code" && auth.busy) {
      leavingCode.current = true;
      auth.cancel();
    }
    go(prevOf(step));
  };

  // ---- delivery ----
  const prefill = (c: CheckoutCustomer | null): Address => ({ name: c?.name ?? "", phone: c?.phone ?? "", postal: c?.postal ?? "", line1: c?.line1 ?? "", line2: c?.line2 ?? "" });
  const [addr, setAddr] = useState<Address>(() => prefill(customer));
  const [hit, setHit] = useState<PostalHit | null>(() => (customer?.postal ? lookupPostal(customer.postal) : null));
  const [postalTried, setPostalTried] = useState(!!customer?.postal);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(customer?.email ?? null);
  // The session arrives after the code step: prefill once from the saved details, without clobbering edits.
  // Adjusted while rendering rather than in an effect, so the empty form never paints in between.
  if (customer && customer.email !== prefilledFor) {
    setAddr(prefill(customer));
    setHit(customer.postal ? lookupPostal(customer.postal) : null);
    setPostalTried(!!customer.postal);
    setPrefilledFor(customer.email);
  }
  const [gift, setGift] = useState(false);
  const [giftMsg, setGiftMsg] = useState("");
  // A blank message means no card; the example text is only a placeholder.
  const giftText = gift && giftMsg.trim() ? giftMsg : null;
  // Delivery time slot (D21): the date is the drop's, the customer picks the time.
  const [slot, setSlot] = useState<DeliverySlot>("none");
  const [pay, setPay] = useState<"card" | "paypay">("card");
  const [touched, setTouched] = useState(false);

  function doLookup() {
    setPostalTried(true);
    setHit(lookupPostal(addr.postal));
  }
  const addrValid = addr.name.trim() && normalisePhone(addr.phone) && addr.line1.trim() && hit?.deliverable;
  const phoneBad = touched && !normalisePhone(addr.phone);
  const nameBad = touched && !addr.name.trim();
  const postalBad = touched && !hit?.deliverable;
  const line1Bad = touched && !addr.line1.trim();
  const addressLine = hit ? `〒${addr.postal} ${hit.prefecture}${hit.city}${hit.town}${addr.line1}${addr.line2 ? " " + addr.line2 : ""}` : "";
  const shortAddress = hit ? `${hit.prefecture}${hit.city}${hit.town}${addr.line1}` : "";

  function submitDelivery(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!addrValid) {
      // Each missing field gets its message (not just a red border); focus goes to the first one.
      const first = !addr.name.trim() ? "co-name" : !normalisePhone(addr.phone) ? "co-phone" : !hit?.deliverable ? "co-postal" : "co-line1";
      document.getElementById(first)?.focus();
      return;
    }
    go("pay");
  }

  // ---- place order ----
  const placedRaw = useStored("session", ORDER_KEY);
  const lastOrder = useMemo(() => parsePlaced(placedRaw), [placedRaw]);
  const placed = step === "done" ? lastOrder : null;
  // Celebrate once, when this tab places the order: not when a reload restores it from sessionStorage.
  const celebrateNext = useRef(false);
  const doneAvatarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step !== "done" || !placed || !celebrateNext.current) return;
    celebrateNext.current = false;
    celebrate(doneAvatarRef.current);
  }, [step, placed]);

  async function placeOrder() {
    if (!hit || !drop || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const h = readHold();
      if (!h?.checkoutId || h.revision == null) {
        // Deep-linked into the flow without a server hold: nothing is reserved to buy.
        setServerExpired(true);
        return;
      }
      const res = await placeOrderAction({
        dropId: drop.id,
        checkoutId: h.checkoutId,
        revision: h.revision,
        locale,
        delivery: addr,
        gift: giftText,
        timeSlot: slot,
        paymentMethod: pay,
      });
      if (!res.ok) {
        if (res.error === "hold_expired") { clearHold(); setServerExpired(true); }
        else if (res.error === "changed") { clearHold(); setNotice(t.cartChanged); go("cart"); }
        else if (res.error === "drop_closed") { clearHold(); setNotice(t.dropUnavailable); go("cart"); }
        else if (res.error === "signed_out") { auth.setNotice(t.signedOut); go("signin", true); }
        else if (res.error === "limit") { clearHold(); setNotice(t.limitReached(res.already, res.name, res.max)); go("cart"); }
        else { setNotice(t.orderFailed); setTouched(true); go("delivery"); }
        return;
      }
      const order: PlacedOrder = { ...res.order, address: addr, hit, gift: giftText };
      celebrateNext.current = true;
      writeStored("session", ORDER_KEY, JSON.stringify(order));
      clearHold();
      cart.clear();
      go("done");
    } finally {
      setBusy(false);
    }
  }

  // ---- derived ----
  const shipLine = drop ? t.shipsArrives(fmtDate(drop.shipAt, locale), fmtDate(drop.arriveAt, locale)) : "";
  const shipLinePost = drop ? t.shipsByPost(fmtDate(drop.shipAt, locale), fmtDate(drop.arriveAt, locale)) : "";
  const chosenSlot: DeliverySlot = step === "done" && placed ? (placed.timeSlot ?? "none") : slot;
  // With the slot, always stated (even "No preference") so the final confirmation screen shows the delivery timing in full.
  const shipLineSlot = drop ? t.shipsByPostSlot(fmtDate(drop.shipAt, locale), fmtDate(drop.arriveAt, locale), t.deliverySlots[chosenSlot]) : "";
  const feeLabel = yen(cart.shippingFee, "¥[fee]");
  const feeIncluded = cart.shippingFee === 0; // D19: shipping is in the box price, so no fee line
  // In the checkout steps the summary is the server's reservation (what placeOrder will buy); the cart step edits the local cart.
  const buyingLines = inCheckout && held ? reservedLines(held.items, cart.boxes) : cart.lines;
  const buying = { lines: buyingLines, ...totals(buyingLines, cart.shippingFee) };
  const summaryLines = step === "done" && placed ? placed.lines : buying.lines.map((l) => ({ name: l.box.name, qty: l.qty, lineTotal: l.lineTotal }));
  const summarySubtotal = step === "done" && placed ? placed.subtotal : buying.subtotal;
  const summaryCount = summaryLines.reduce((n, l) => n + l.qty, 0);
  const summaryTotal = step === "done" && placed ? placed.total : buying.total;
  const totalLabel = yen(summaryTotal, "¥[total]");
  const placeLabel = pay === "card" ? t.placeOrderCard(totalLabel) : t.placeOrderPaypay;
  const backLabel = { signin: t.backToBoxes, code: t.useDifferentEmail, delivery: customer ? t.backToBoxes : t.back, pay: t.backToDelivery }[step as "signin"] ?? t.back;
  const doneEmail = placed?.email || customer?.email || email;
  const doneName = placed?.address.name ?? addr.name;
  const doneAddr = placed ? `${placed.hit.prefecture}${placed.hit.city}${placed.hit.town}${placed.address.line1}` : shortAddress;

  const dotClass = (n: number) => `${s.dot} ${n < idx ? s.dotDone : n === idx ? s.dotCurrent : ""}`;
  // The phone layout wraps the list in a labelled <nav>, so the list itself goes unlabelled there.
  const stepList = (cls: string, labelled = true) => (
    <ol aria-label={labelled ? t.checkoutSteps : undefined} className={cls}>
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
      <span className={s.holdLabel}>{t.heldLabel}</span>{fmtCountdown(holdLeft)}
    </div>
  );

  const cancelNote = drop && (
    <div className="note">
      <span className="w9">{t.cancelling}</span> {t.cancelPolicy(fmtDateTime(drop.closeAt, locale))}{" "}
      <a href={`${home}/legal/tokushoho`} className="w9">{t.tokushoho}</a>
    </div>
  );
  const agree = <p className={s.noteSmall}>{t.agreeTerms}<a href={`${home}/legal/terms`}>{t.termsLink}</a>{t.agreeTermsEnd}</p>;
  const lineNudge = (
    <div className={s.lineNudge}>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div className="w9">{t.lineNudgeTitle}</div>
        <div className="small w7">{t.lineNudgeSub}</div>
      </div>
      <a href={lineUrl} className={s.lineNudgeBtn}>{t.addFriend}</a>
    </div>
  );

  return (
    <div className={s.page}>
      {/* ===== Header ===== */}
      <header className={s.header}>
        <div className={`container ${s.headerRow}`}>
          {isCart && <Link href={home} aria-label={t.backToShop} className={s.iconBtn}><ArrowLeftIcon /></Link>}
          {inCheckout && <button type="button" aria-label={t.back} onClick={back} className={s.iconBtn}><ArrowLeftIcon /></button>}
          {step === "done" && <span className={s.spacer} />}
          <Logo href={home} label={t.home} size="sm" />
          {inCheckout && stepList(s.stepsTop)}
          {holdChip}
          {!inCheckout && <span className={s.spacer} />}
          {isCart && <Link href={home} className={s.headerLink}><ArrowLeftIcon size={18} />{t.keepShopping}</Link>}
          {step === "done" && <Link href={home} className={s.headerLink}>{t.backToShop}</Link>}
        </div>
      </header>

      {inCheckout && <nav aria-label={t.checkoutSteps}>{stepList(s.steps, false)}</nav>}

      {(step === "signin" || step === "code" || step === "delivery") && (
        <section aria-label={t.orderSummary} className={s.pinned}>
          <div style={{ minWidth: 0 }}>
            <div className={s.l1}>{t.boxCount(buying.count)} · {yen(buying.subtotal)} <span className={s.sub13}>{feeIncluded ? t.shippingIncluded : t.plusShipping}</span></div>
            <div className={s.l2}>{shipLine}</div>
          </div>
          <TruckIcon />
        </section>
      )}

      <div className={s.body}>
        {/* ===== Main column ===== */}
        <main className={s.main}>
          {inCheckout && !holdExpired && (
            <button type="button" onClick={back} className={s.backBtn}><ArrowLeftIcon size={18} />{backLabel}</button>
          )}

          {holdExpired ? (
            <>
              <div role="alert" className="alert">
                <div className="alert-title"><WarningIcon /><div className={`display`} style={{ fontSize: 18, lineHeight: 1.15 }}>{t.holdExpiredTitle}</div></div>
                <div className="small w7" style={{ fontSize: 14 }}>{t.holdExpiredBody}</div>
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={() => { clearHold(); setServerExpired(false); go("cart"); }}>{t.backToCart}</button>
            </>
          ) : (
            <>
              {/* ---- Cart ---- */}
              {isCart && (
                <CartStep t={t} cart={cart} changes={changes} maxFor={maxFor} shipLinePost={shipLinePost} feeLabel={feeLabel} totalLabel={totalLabel} onCheckout={onCheckout} home={home} demo={demo} closed={!drop} notice={notice} busy={busy} />
              )}

              {/* ---- Sign in ---- */}
              {step === "signin" && (
                <div className={`stack ${s.narrow}`} style={{ gap: 16 }}>
                  <h1 className={`display ${s.h1sm}`}>{t.signInTitle}</h1>
                  <p className={s.lead}>{t.signInBody}</p>
                  {auth.notice && <div role="alert" className="note">{auth.notice}</div>}
                  <form className={s.form} onSubmit={(e) => { e.preventDefault(); void auth.request().then((ok) => { if (ok) go("code"); }); }}>
                    <label htmlFor="co-email" className="label">{t.emailAddress}</label>
                    <input id="co-email" type="email" required autoComplete="email" placeholder="you@example.com" className="input" value={auth.email} onChange={(e) => auth.setEmail(e.target.value)} />
                    <button type="submit" className={`btn btn-primary ${s.selfStart}`} style={{ marginTop: 6 }} disabled={auth.busy}>{t.emailMeCode}</button>
                  </form>
                  <div className={s.inline}><CheckIcon />{t.cartStays}</div>
                </div>
              )}

              {/* ---- Code ---- */}
              {step === "code" && (
                <div className={`stack ${s.narrow}`} style={{ gap: 16 }}>
                  <h1 className={`display ${s.h1sm}`}>{t.checkEmail}</h1>
                  <p className={s.lead}>{rich(t.sentTo, auth.email)}</p>
                  {auth.notice && <div role="alert" className="note">{auth.notice}</div>}
                  <form className={s.form} onSubmit={(e) => { e.preventDefault(); void auth.verify(); }}>
                    <label htmlFor="co-code" className="label">{t.sixDigit}</label>
                    <div className={s.codeRow}>
                      <CodeInput id="co-code" value={auth.code} onChange={auth.setCode} doneLabel={t.codeAccepted} checking={auth.busy} done={auth.verified} misses={auth.misses} />
                      <button type="submit" className="btn btn-primary" disabled={auth.code.length !== 6 || auth.busy}>{t.continue}</button>
                    </div>
                  </form>
                  <div className={s.hideDesktop}><div className="note">{t.inAppTip}</div></div>
                  <div className={s.resendRow}>
                    <span>{t.didntGetIt}</span>
                    <button type="button" className={s.resendBtn} disabled={auth.resendLeft > 0 || auth.busy} onClick={() => void auth.request()}>
                      {auth.resendLeft > 0 ? t.resendIn(fmtCountdown(auth.resendLeft)) : t.resend}
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
                        <label htmlFor="co-name" className="label">{t.recipientName} {jaHint("お名前")}</label>
                        <input id="co-name" type="text" autoComplete="name" required className={`input ${nameBad ? s.inputError : ""}`} value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })}
                          aria-invalid={nameBad || undefined} aria-describedby={nameBad ? "co-name-err" : undefined} />
                        {nameBad && <span id="co-name-err" className={s.err}><WarningIcon size={16} />{t.nameRequired}</span>}
                      </div>
                      <div className="field">
                        <label htmlFor="co-phone" className="label">{t.phone} {jaHint("電話番号")}</label>
                        <CleanInput id="co-phone" type="tel" autoComplete="tel" required clean={cleanPhoneInput} className={`input ${phoneBad ? s.inputError : ""}`} value={addr.phone} onValueChange={(phone) => setAddr({ ...addr, phone })}
                          aria-invalid={phoneBad || undefined} aria-describedby="co-phone-hint" />
                        {phoneBad
                          ? <span id="co-phone-hint" className={s.err}><WarningIcon size={16} />{t.phoneInvalid}</span>
                          : <span id="co-phone-hint" className="hint">{t.phoneHint}</span>}
                      </div>
                      <div className="field">
                        <label htmlFor="co-postal" className="label">{t.postalCode} {jaHint("郵便番号")}</label>
                        <div className={s.postalRow}>
                          <CleanInput id="co-postal" type="text" inputMode="numeric" autoComplete="postal-code" required clean={cleanPostalInput} className={`input ${postalBad ? s.inputError : ""}`} value={addr.postal}
                            aria-invalid={postalBad || undefined} aria-describedby="co-postal-status"
                            onValueChange={(postal) => { setAddr({ ...addr, postal }); setPostalTried(false); setHit(null); }}
                            onBlur={() => { if (normalisePostal(addr.postal).length === 7) doLookup(); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } }} />
                          <button type="button" className={s.lookupBtn} onClick={doLookup}>{t.lookUp}</button>
                        </div>
                      </div>
                      {/* The lookup result doubles as the postal field's description, and is announced when it changes. */}
                      <div id="co-postal-status" className={s.autofill} aria-live="polite">
                        <div className={s.k}>{t.filledFrom}</div>
                        {hit ? (
                          <>
                            <div className={s.addr}>{hit.prefecture} {hit.city} {hit.town}</div>
                            {hit.deliverable
                              ? <div className={s.okPill}><CheckIcon size={15} strokeWidth={3} />{t.weDeliverTo(locale === "ja" ? hit.city : hit.wardEn)}</div>
                              : <div className={s.badPill}><WarningIcon size={15} />{t.outsideArea}</div>}
                          </>
                        ) : (
                          <div className={s.addr} style={{ opacity: postalTried || postalBad ? 1 : 0.5 }}>
                            {postalTried
                              ? <span className={s.badPill}><WarningIcon size={15} />{outsideWards(addr.postal) ? t.outsideArea : t.postalNotFound}</span>
                              : postalBad
                                ? <span className={s.badPill}><WarningIcon size={15} />{t.postalRequired}</span>
                                : <span aria-hidden>—</span>}
                          </div>
                        )}
                      </div>
                      <div className="field">
                        <label htmlFor="co-line1" className="label">{t.streetNumber} {jaHint("番地")}</label>
                        <input id="co-line1" type="text" autoComplete="address-line1" required className={`input ${line1Bad ? s.inputError : ""}`} value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })}
                          aria-invalid={line1Bad || undefined} aria-describedby={line1Bad ? "co-line1-err" : undefined} />
                        {line1Bad && <span id="co-line1-err" className={s.err}><WarningIcon size={16} />{t.streetRequired}</span>}
                      </div>
                      <div className="field">
                        <label htmlFor="co-line2" className="label">{t.building} {jaHint("建物名・部屋番号")} <span className="ja">{t.optional}</span></label>
                        <input id="co-line2" type="text" autoComplete="address-line2" placeholder={t.buildingPlaceholder} className="input" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
                      </div>
                    </div>

                    <div className={s.mobileOnly}>
                      <InfoStrip align="start">
                        <div className="w9">{shipLine}</div>
                        <div className="small w7">{t.sameDayNote}</div>
                      </InfoStrip>
                    </div>

                    {drop && (
                      <div className="stack" style={{ gap: 6 }}>
                        <SlotOptions locale={locale} name="co-slot" legend={t.slotLegend(fmtDate(drop.arriveAt, locale))} value={slot} onChange={setSlot} />
                        <span className="small w7">{t.slotHint}</span>
                      </div>
                    )}

                    <label className={s.giftToggle}>
                      <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} />
                      {t.giftToggle}
                    </label>
                    {gift && (
                      <div className={`field ${s.giftField}`}>
                        <label htmlFor="co-gift" className="label">{t.giftLabel} <span className="ja">{t.giftHint}</span></label>
                        <textarea id="co-gift" rows={3} maxLength={150} className="input" placeholder={t.giftPlaceholder} value={giftMsg} onChange={(e) => setGiftMsg(e.target.value)} />
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
                      {buying.lines.map((l) => (
                        <div key={l.box.id} className={s.tr}>
                          <span>{l.box.name} <span className="w9">× {l.qty}</span> <span className={s.sub12}>({yen(l.box.price)} {t.each})</span></span>
                          <span className={s.v} style={{ whiteSpace: "nowrap" }}>{yen(l.lineTotal)}</span>
                        </div>
                      ))}
                      <div className={`${s.tr}`} style={{ borderTop: "2px dashed var(--ink)", paddingTop: 8, marginTop: 2 }}><span>{t.subtotal}</span><span className={s.v}>{yen(buying.subtotal)}</span></div>
                      {!feeIncluded && <div className={s.tr}><span>{t.shipping}</span><span className={s.v}>{feeLabel}</span></div>}
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
                    {giftText && <div className={s.giftNote}><span className="w9">{t.giftCard}</span> {giftText}</div>}
                    <div className={s.shipLine}><TruckIcon size={20} />{shipLineSlot}</div>
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
                    <button type="button" onClick={placeOrder} disabled={busy} className="btn btn-primary btn-block" style={{ minHeight: 64 }}>{placeLabel}</button>
                    {agree}
                  </div>
                </div>
              )}

              {/* ---- Confirmation ---- */}
              {step === "done" && (
                <div className={s.doneContent}>
                  <section className={s.doneHero}>
                    <div ref={doneAvatarRef} className={s.doneAvatar}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/images/astro-cookie.jpg" alt={t.astroCookieAlt} />
                      <StarShape fill="var(--butter)" />
                    </div>
                    <div className={s.doneText}>
                      <h1 className={`display ${s.doneTitle}`}>{t.youreIn}</h1>
                      <p className={s.doneBody}>{t.confirmed(placed?.number ?? "AB-···-···", doneEmail)}</p>
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
                        { bg: "var(--pink)", date: drop ? fmtDate(drop.closeAt, locale) : null, m: t.next1, d: t.dropCloses, sub: t.next1Sub },
                        { bg: "var(--butter)", date: null, m: t.next2, d: `${t.bakeDay}`, d2: t.allAtOnce, sub: t.next2Sub },
                        { bg: "var(--aqua)", date: drop ? fmtDate(drop.shipAt, locale) : null, m: t.next3, d: t.shipsByPostShort, sub: t.next3Sub },
                        { bg: "var(--lilac)", date: drop ? fmtDate(drop.arriveAt, locale) : null, m: t.next4, d: t.arrivesShort, sub: chosenSlot === "none" ? t.next4Sub(doneName) : `${t.next4Sub(doneName)} ${t.deliverySlots[chosenSlot]}` },
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
            {!feeIncluded && <div className={s.tr}><span>{t.shipping} <span className={s.sub13}>{t.shippingFlatShort}</span></span><span className={s.v}>{feeLabel}</span></div>}
            <div className={`${s.tr} ${s.trTotal}`}><span className={s.k}>{t.total} <span className={s.sub12}>{t.taxIncl}</span></span><span className={s.v}>{totalLabel}</span></div>
            <div className={s.summaryStrip}><TruckIcon size={20} />{step === "delivery" || step === "pay" || step === "done" ? shipLineSlot : shipLine}</div>
          </section>

          {isCart && drop && (
            <div className={s.asideBlock}>
              <button type="button" onClick={onCheckout} disabled={cart.count === 0 || busy} className="btn btn-primary btn-block" style={{ minHeight: 64, fontSize: 22 }}>{t.checkout}</button>
              <p className={s.asideNote}>{t.holdNote}</p>
            </div>
          )}
          {step === "pay" && !holdExpired && (
            <div className={s.asideBlock} style={{ gap: 14 }}>
              {cancelNote}
              <button type="button" onClick={placeOrder} disabled={busy} className="btn btn-primary btn-block" style={{ minHeight: 66 }}>{placeLabel}</button>
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

/** A cart row's picture: the box's photo, or a camera glyph on its tint until it has one (D4). The name sits beside it, so the image is decorative. */
function Thumb({ box }: { box: Box }) {
  return (
    <div className={s.thumb} style={{ background: box.tint }}>
      {box.photo ? <Image src={box.photo} alt="" fill sizes="104px" /> : <CameraIcon size={22} />}
    </div>
  );
}

/* ---------------- Cart step ---------------- */
function CartStep({ t, cart, changes, maxFor, shipLinePost, feeLabel, totalLabel, onCheckout, home, demo, closed, notice, busy }: {
  t: Strings; cart: ReturnType<typeof useCart>; changes: Change[] | null; maxFor: (b: Box) => number;
  shipLinePost: string; feeLabel: string; totalLabel: string; onCheckout: () => void; home: string; demo: string | null;
  closed: boolean; notice: string | null; busy: boolean;
}) {
  const gone = changes?.filter((c): c is Extract<Change, { kind: "gone" }> => c.kind === "gone") ?? [];
  const rows: CartLine[] = cart.lines;
  const empty = cart.hydrated && rows.length === 0 && gone.length === 0;
  if (closed) {
    // No drop is open (PRD 5.2a: new checkouts blocked), so there is nothing to sell.
    return (
      <div className="stack" style={{ gap: 18 }}>
        <h1 className={`display ${s.h1}`}>{t.yourBoxes}</h1>
        <div className={s.empty}>
          <div className="display" style={{ fontSize: 22 }}>{t.checkoutClosedTitle}</div>
          <p className="w7" style={{ fontSize: 14 }}>{t.checkoutClosedBody}</p>
          <Link href={`${home}#notify`} className="btn btn-secondary raised">{t.backToShop}</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 18 }}>
      <h1 className={`display ${s.h1}`}>{t.yourBoxes}</h1>

      {notice && <div role="alert" className="note">{notice}</div>}

      {changes && changes.length > 0 && (
        <div role="alert" className="alert">
          <div className="alert-title"><WarningIcon /><div className="display">{t.recheckTitle}</div></div>
          <ul>
            {changes.map((c, i) => (
              <li key={i}>
                {c.kind === "gone"
                  ? rich(t.recheckGone, c.box.name)
                  : rich((n) => t.recheckCut(c.left, n, c.from, c.to), t.boxNames(c.box.name))}
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
              <Thumb box={l.box} />
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
              <Thumb box={c.box} />
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
          {cart.shippingFee !== 0 && <div className={s.tr}><span>{t.shipping} <span className={s.sub13}>{t.shippingFlat}</span></span><span className={s.v}>{feeLabel}</span></div>}
          <div className={`${s.tr} ${s.trTotal}`}><span className={s.k}>{t.total} <span className={s.sub12}>{t.taxIncl}</span></span><span className={s.v}>{totalLabel}</span></div>
        </div>
        <InfoStrip><span>{shipLinePost}</span></InfoStrip>
        <button type="button" onClick={onCheckout} disabled={cart.count === 0 || busy} className="btn btn-primary btn-block" style={{ minHeight: 62, fontSize: 21 }}>{t.checkout}</button>
        <p className={s.primaryNote}>{t.holdNote}</p>
      </div>
    </div>
  );
}
