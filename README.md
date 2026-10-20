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

Unit tests cover the drop state machine and `getHome()` (timeline, draft visibility, demo overrides), the cart provider (clamping to injected stock and prices, restoring a saved cart, switching drops, production gating) and the pure checkout rules.

Integration tests (`src/lib/checkout.integration.test.ts`, `src/lib/auth.integration.test.ts`) run the real write paths against Postgres: sign-in by link and by code, lockout, expiry, rate limits, subscriber conversion, sessions; holds and availability, concurrent order submission, reservation changes between tabs, the per-customer limit across orders, finishing a held checkout after the drop closes, and customer records never being overwritten. They need `TEST_DATABASE_URL` and skip without it:

```sh
docker run -d --name astro-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=astro_test -p 5433:5432 postgres:16
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/astro_test pnpm test
```

CI runs type-check and all tests against a Postgres service on every pull request (`.github/workflows/ci.yml`).

## Database

Neon Postgres, provisioned through the Vercel Marketplace (resource `neon-claret-ladder`), with Drizzle ORM. The schema is `src/db/schema.ts`; migrations are generated from it into `drizzle/` and reviewed as SQL.

```sh
pnpm db:generate   # diff schema.ts → new migration in drizzle/
pnpm db:migrate    # apply migrations (uses the unpooled URL)
pnpm db:seed       # load the sample catalogue, Drop 03 / 04, settings, sample customer (idempotent)
pnpm db:studio     # browse the data
```

The homepage reads drops, boxes and settings from the database (`src/lib/drops.ts`). Tables: customers, addresses, subscribers, auth_tokens, sessions, notification_log, drops, boxes, items, box_items, drop_boxes, settings, carts, inventory_holds, orders, order_items.

## Sign-in

Magic link + 6-digit code (D13, PRD 2.1), in `src/lib/auth.ts` with the pure rules in `auth-rules.ts`:

- **Request** (`/sign-in`, or the checkout's email step): one email with a link and a code, same answer whether or not the address has an account, rate-limited per email and per IP. Tokens live in `auth_tokens` as hashes, 15 minutes, single use; the code locks after 5 wrong tries.
- **Verify**: requesting a code sets a short-lived `ab-auth` flow cookie whose hash is stored on the token. The browser that asked redeems the link silently at `/{locale}/auth/verify` (and is the only one whose typed code counts); any other browser, or an email link scanner, is sent to `/{locale}/auth/confirm`, which names the masked address and needs a same-origin POST before any session changes, so a link can never switch someone's account without a deliberate click. First verified sign-in creates the customer (conflict-safe), converts a matching notify-me subscriber (PRD 2.7), and opens a 90-day session (`sessions` table, `ab-session` httpOnly cookie). `/account` shows who you are and signs out.
- **Rate limits** are checked and consumed under per-email and per-IP advisory locks, so a burst of concurrent requests gets exactly the allowance.
- **Checkout** places orders for the signed-in customer only; the confirmed delivery details become their saved profile and address (PRD 2.3). The magic link lands back on the checkout at the delivery step with the cart intact: its return path names this browser's reservation (`?r=<checkoutId>:<revision>`), which a fresh tab adopts only if it still matches the server exactly. The pending email and resend timer live per tab so a refresh of the code screen keeps working.
- **Email** goes through Resend (D23, Vercel Marketplace resource `resend-email-coquelicot-diamond`, Tokyo region) via `src/lib/email.ts`; every send is recorded in `notification_log`. The sending domain needs Resend's DKIM and SPF records at GoDaddy before `hello@astrobakes.xyz` can send; until then set `EMAIL_FROM="Astro Bakes <onboarding@resend.dev>"` for testing to your own address.

## Checkout write path

`src/lib/checkout.ts` (server only; pure rules in `checkout-rules.ts`), exposed to the client as server actions in `src/app/[locale]/checkout/actions.ts`:

- **Checkout →** calls `startCheckout`: inside a transaction that locks the drop's boxes it re-checks the cart against `cap − sold − active holds`, reports anything gone or cut, and otherwise writes a `carts` row plus 10-minute `inventory_holds`. The cart id goes in an httpOnly `ab-cart` cookie; the hold expiry comes back for the countdown.
- **Place order** calls `placeOrder`: with an unexpired held cart it creates the customer from the checkout email (unverified until sign-in exists), saves the address, takes the next per-drop sequence under a row lock (`AB-003-017`), writes `orders` + `order_items` with name and price snapshots, then `markPaid` sells the stock and releases the holds. Payment is **mocked**: `markPaid` runs immediately with a note on the order; the Stripe PR moves it into the webhook.
- The storefront's "N left" is `cap − sold − active holds`, leaving out the viewer's own cart (D6, D8). In the checkout steps the summary and the submission are the server's reservation (checkout id + revision), not the editable cart: a tab whose reservation was replaced by another tab is sent back to review.
- No drop open means no checkout: the cart step shows a closed notice and the actions refuse (PRD 5.2a). A checkout that already holds boxes can still finish after close while its hold lasts (PRD 3.8). Outside production `?state=open` sells the most recent drop and `?demo=soldout` makes the re-check find only 2 cookie boxes and no loaf.

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
- `?demo=cart` seeds a cart (1 cookie box, 1 loaf); combine it with `?state=open` on the homepage or checkout while no drop is live.
- `?demo=soldout` on `/en/checkout?state=open` seeds 3 cookie boxes + 1 loaf; pressing **Checkout →** makes the server's re-check find only 2 cookie boxes and no loaf, so the sold-out alert shows.
- Checkout steps are deep-linkable: `/en/checkout?step=delivery` etc.
- Postal codes that resolve in the mock: `153-0061`, `150-0001`, `106-0032`, `100-0001` (deliverable); `180-0004`, `231-0001` (outside the 23 wards).
- The hold timer is real and lives in sessionStorage; let it run out to see the expired state.

## Not built yet (per handoff, build from the PRD)

FAQ, legal pages, account pages, admin, payment failure, PayPay "confirming…" page, Japanese copy, real photography, Stripe, any backend.
