# Astro Bakes — website

Customer site for a drop-model bakery (see `PRD.md`). Built from the V2 · Fun design handoff; the designer's source artboards live in `design-ref/` (homepage states are specified in `design-ref/DROP-STATES.md`).

## Run

```sh
pnpm install
pnpm dev        # http://localhost:3000 → redirects to /en or /ja
pnpm build
```

## Where things are

| Path | What |
| --- | --- |
| `src/app/[locale]/page.tsx` | Homepage; the variant (open / scheduled / closed / no drop) comes from the drop state machine in `data.ts` |
| `src/app/[locale]/checkout/page.tsx` | Buy flow: cart → sign in → code → delivery → pay → done |
| `src/components/` | One file per section; `Checkout.tsx` holds the whole flow |
| `src/app/globals.css` | Design tokens and shared sticker-style classes |
| `src/lib/data.ts` | Mock drops / boxes / settings / viewer, plus `getHome()` which picks the homepage state (sample data, replace with DB) |
| `src/lib/i18n.ts` | Every customer-facing string; `ja` falls back to `en` until copy exists |
| `src/lib/cart.tsx` | Client cart, persisted per drop in localStorage |
| `src/lib/postal.ts`, `src/lib/hold.ts` | Mock postal lookup and the 10-minute hold |

## Playing with it

- The homepage picks its state from the mock drop dates and the clock (PRD 5.2a): Drop 03 closed on Oct 18 and ships Oct 25, so today it shows **closed** with Drop 04 as the next drop; from Oct 29 it shows **scheduled**; Drop 04 opens Nov 8 at 10:00 JST.
- Force a state with `?state=open`, `?state=scheduled`, `?state=closed` or `?state=nodrop`. Add `&next=0` to `closed` to hide the next drop.
- `?viewer=member` renders a signed-in, opted-in viewer (avatar in the nav, "You're on the list" instead of the email form). `?viewer=ordered` adds their order card on the closed page.
- `?demo=cart` seeds a cart (1 cookie box, 1 loaf); on the homepage combine it with `?state=open`.
- `?demo=soldout` on `/en/checkout` seeds 3 cookie boxes + 1 loaf; pressing **Checkout →** runs the inventory re-check and shows the sold-out alert.
- Checkout steps are deep-linkable: `/en/checkout?step=delivery` etc.
- Postal codes that resolve in the mock: `153-0061`, `150-0001`, `106-0032`, `100-0001` (deliverable); `180-0004`, `231-0001` (outside the 23 wards).
- The hold timer is real and lives in sessionStorage; let it run out to see the expired state.

## Not built yet (per handoff, build from the PRD)

FAQ, legal pages, account pages, admin, payment failure, PayPay "confirming…" page, Japanese copy, real photography, Stripe, any backend.
