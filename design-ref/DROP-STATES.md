# Homepage drop states — design add-on

Adds the three homepage states that were missing from the first handoff: **scheduled**, **closed** and **no drop** (PRD 1.1, 1.3, 1.5). Unzip over the existing `astro-bakes-design/` folder; nothing in it is replaced.

## Files

| File | What it is |
| --- | --- |
| `design/FunStates.dc.html` | The homepage for every not-open state, in one responsive file. Props: `state` = `scheduled` / `closed` / `nodrop`; `ordered` = signed-in viewer who has an order in the closed drop. |
| `design/StateScheduled.dc.html` … `StateDesktopNoDrop.dc.html` | Wrappers that render one state at mobile (390) or desktop (1280) width. They also carry the ticker, bob and spin keyframes. |

These reuse the same tokens and components as `Fun.dc.html` / `FunDesktop.dc.html`; see `HANDOFF.md`. Everything below the hero (How a drop works, Meet Astro, notify-me, footer) is unchanged from the open state.

## What changes per state

| | Scheduled | Closed | No drop |
| --- | --- | --- | --- |
| Ticker | DROP 04 OPENS SUN NOV 8, 10:00 JST · TOKYO 23 WARDS · SHIPS NOV 22 · GET NOTIFIED | DROP 03 IS CLOSED · SHIPS SUN OCT 25 · NEXT DROP SUN NOV 8 · TOKYO 23 WARDS | BETWEEN DROPS · NEXT DATE COMING SOON · TOKYO 23 WARDS · GET NOTIFIED |
| Nav | No cart button (nothing to buy) | Same | Same |
| Eyebrow sticker | DROP 04 · NOVEMBER (butter) | DROP 03 · CLOSED (white) | BETWEEN DROPS (aqua) |
| Hero detail | "DROP 04 OPENS IN" + days and hours tiles (no seconds). Tickets: ORDERS OPEN Sun, Nov 8 · 10:00 JST / 3 boxes · ¥[fee] shipping; ARRIVES Mon, Nov 23 / ships Sun, Nov 22 | Tickets: DROP 03 IS CLOSED / Every order ships Sun, Oct 25; NEXT DROP Sun, Nov 8 · 10:00 JST / Drop 04 · November | Card: BETWEEN DROPS / "No drop is scheduled yet. The next date goes out by email and LINE first." |
| Hero action | Email field + "Remind me". Label "Get an email the moment Drop 04 opens" | Email field + "Notify me". Label "Get an email when Drop 04 opens" | Email field + "Notify me". Label "Be first to hear the next drop date" |
| Speech bubble | "Opens Sunday at 10!" | "Ovens are on!" | "Napping between drops." |
| Hero photo | Astro with cookie | Astro with cookie | Astro outdoors |
| Boxes heading | "Coming in Drop 04" | "Coming in Drop 04" (next drop's boxes) | "The menu" — all active boxes |
| Box card | Tag "In the next drop" (butter); footer "Order from Sun, Nov 8 · 10:00 JST". No stepper, no stock badge. | Same as scheduled | Tag "Back next drop" (white); footer "Ordering opens with the next drop" |

Under the email field in every state: "Drop emails only. Unsubscribe any time." and an "Or add us on LINE" link to `#notify`.

### Closed, signed in with an order (`ordered`)

- Nav shows an account avatar instead of "Sign in".
- The email form is replaced by an order card linking to the order page: "Your 2 boxes ship Sun, Oct 25 / Arriving Mon, Oct 26 · order AB-003-017 / View →" (PRD 1.1).
- Below it, a ticked notification preference: "You're on the list for Drop 04. We'll email you when it opens." (PRD 1.5 / 2.4: signed-in users see their toggle, not an email field).
- The bottom notify section shows "You're on the list. Change this in your account settings." in place of its form.

## Logic to build

- Pick the state from the Drop state machine (PRD 5.2a): `scheduled` → Scheduled; `closed` / `baking` / `shipped` → Closed; no current or upcoming drop → No drop. `open` uses the existing open-state homepage.
- Closed without a next drop scheduled: drop the NEXT DROP ticket and use the no-drop label and boxes ("The menu").
- Scheduled, signed in and already opted in: replace the email form with "You're on the list" (PRD 1.1), as in the ordered variant.
- Countdown shows days and hours only, recalculated on load.

## Sample data and open calls

- All dates, the drop numbers, "3 boxes", the order number and the box list are samples; wire them to Drop / DropBox / Order.
- Showing the *next* drop's boxes on the closed page is an assumption; PRD 1.3's open question covers only the scheduled/open and no-drop cases.
- The speech bubbles and the "between drops" copy are placeholder voice — confirm or replace.
- Japanese copy still to be written.
