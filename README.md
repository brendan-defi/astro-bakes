# Astro Bakes — website

Customer site for a drop-model bakery (see `PRD.md`). Built from the V2 · Fun design handoff; the designer's source artboards live in `design-ref/` (homepage states are specified in `design-ref/DROP-STATES.md`).

## Run

```sh
pnpm install
npx vercel link            # once; links this folder to the Vercel project
npx vercel env pull        # writes .env.local with the Neon connection strings
pnpm dev                   # http://localhost:3000 → redirects to /en or /ja
pnpm build
```

## Tests

```sh
pnpm test          # Vitest: src/**/*.test.ts(x), jsdom for the cart provider
pnpm test:watch
```

Regression tests cover the drop state machine and `getHome()` (timeline, draft visibility, demo overrides) and the cart provider (clamping to injected stock and prices, restoring a saved cart, switching drops, production gating). CI runs type-check and tests on every pull request (`.github/workflows/ci.yml`).

## Database

Neon Postgres, provisioned through the Vercel Marketplace (resource `neon-claret-ladder`), with Drizzle ORM. The schema is `src/db/schema.ts`; migrations are generated from it into `drizzle/` and reviewed as SQL.

```sh
pnpm db:generate   # diff schema.ts → new migration in drizzle/
pnpm db:migrate    # apply migrations (uses the unpooled URL)
pnpm db:seed       # load the sample catalogue, Drop 03 / 04, settings, sample customer (idempotent)
pnpm db:studio     # browse the data
```

The homepage reads drops, boxes and settings from the database (`src/lib/drops.ts`). The checkout still runs on the mock data in `src/lib/data.ts` until orders are wired. Tables so far: customers, addresses, subscribers, auth_tokens, drops, boxes, items, box_items, drop_boxes, settings.

## Where things are

| Path | What |
| --- | --- |
| `src/app/[locale]/page.tsx` | Homepage; the variant (open / scheduled / closed / no drop) comes from the drop state machine in `data.ts` |
| `src/app/[locale]/checkout/page.tsx` | Buy flow: cart → sign in → code → delivery → pay → done |
| `src/components/` | One file per section; `Checkout.tsx` holds the whole flow |
| `src/app/globals.css` | Design tokens and shared sticker-style classes |
| `src/lib/data.ts` | View types, `getHome()` (picks the homepage state from a data source), and the mock data the checkout still uses |
| `src/db/` | Drizzle schema, lazy client, seed script |
| `src/lib/drops.ts` | Server-side reads: drops with boxes, the catalogue, settings |
| `src/lib/i18n.ts` | Every customer-facing string; `ja` falls back to `en` until copy exists |
| `src/lib/cart.tsx` | Client cart, persisted per drop in localStorage |
| `src/lib/postal.ts`, `src/lib/hold.ts` | Mock postal lookup and the 10-minute hold |

## Playing with it

- The homepage picks its state from the seeded drop dates and the clock (PRD 5.2a): Drop 03 closed on Oct 18 and ships Oct 25, so today it shows **closed** with Drop 04 as the next drop; from Oct 29 it shows **scheduled**; Drop 04 opens Nov 8 at 10:00 JST.
- Force a state with `?state=open`, `?state=scheduled`, `?state=closed` or `?state=nodrop`. Add `&next=0` to `closed` to hide the next drop.
- All of these switches, including `?demo=`, work in local dev and on Vercel preview deployments only. Production ignores them (`src/lib/demo.ts`).
- `?viewer=member` renders a signed-in, opted-in viewer (avatar in the nav, "You're on the list" instead of the email form). `?viewer=ordered` adds their order card on the closed page.
- `?demo=cart` seeds a cart (1 cookie box, 1 loaf); on the homepage combine it with `?state=open`.
- `?demo=soldout` on `/en/checkout` seeds 3 cookie boxes + 1 loaf; pressing **Checkout →** runs the inventory re-check and shows the sold-out alert.
- Checkout steps are deep-linkable: `/en/checkout?step=delivery` etc.
- Postal codes that resolve in the mock: `153-0061`, `150-0001`, `106-0032`, `100-0001` (deliverable); `180-0004`, `231-0001` (outside the 23 wards).
- The hold timer is real and lives in sessionStorage; let it run out to see the expired state.

## Not built yet (per handoff, build from the PRD)

FAQ, legal pages, account pages, admin, payment failure, PayPay "confirming…" page, Japanese copy, real photography, Stripe, any backend.
