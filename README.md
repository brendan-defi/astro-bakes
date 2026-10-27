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

The seeded drops are pinned relative to the clock when a suite resets its database (`reseed` in `src/test/db.ts`), so tests must derive dates from the loaded drop rather than from the calendar. `TEST_CLOCK=<ISO date-time>` runs the suite as if it were then (JS `Date` only; timers and Postgres's own `now()` stay real) to catch a test that leans on the calendar; the sign-in rate-limit and subscriber welcome suites compare JS time with Postgres-stamped rows and are the two that read wrongly under it.

Each suite drops and recreates the database's `public` schema, so give every worktree its own database (`docker exec astro-test-pg psql -U postgres -c "create database astro_test_<topic>"`). The shared setup in `src/test/db.ts` (`testDb`, `resetDatabase`, `clearTestData`, `captureEmail`, `closeTestDb`) refuses any host other than this machine (the host node-postgres will actually connect to, so a `?host=` override counts) unless `TEST_DATABASE_ALLOW_REMOTE=1`. That catches a production URL pasted by mistake; it can't tell that a local port is a tunnel to somewhere else, so don't point it at one. New integration suites should start from it.

CI runs type-check and all tests against a Postgres service on every pull request (`.github/workflows/ci.yml`).

## Database

Neon Postgres, provisioned through the Vercel Marketplace (resource `neon-claret-ladder`), with Drizzle ORM. The schema is `src/db/schema.ts`; migrations are generated from it into `drizzle/` and reviewed as SQL.

```sh
pnpm db:generate   # diff schema.ts → new migration in drizzle/
pnpm db:migrate    # apply migrations (uses the unpooled URL)
pnpm db:seed       # load the sample catalogue, Drop 03 / 04, settings, sample customer (idempotent)
pnpm db:studio     # browse the data
```

The homepage reads drops, boxes and settings from the database (`src/lib/drops.ts`). The notify-me forms (PRD 1.5) store signups in `subscribers` through `subscribeAction` (`src/lib/subscribe.ts`); signed-in customers get a status line or a one-tap opt-in instead, backed by the same preference as the account page. A visitor (hashed IP) gets 10 valid sign-up attempts an hour (`signup_attempts`, counted the same whether or not the address has an account); each newly active address is owed a welcome email with a one-click unsubscribe, retried (`retryPendingWelcomes`, run after each successful sign-up) with back-off, up to 5 times within 7 days, if sending fails. `deliverWelcome` holds the address's lock across the provider call, so it can't race an unsubscribe or another retry. Every send has a 10-second provider deadline (`sendEmail`), so a slow provider can't hold that lock, or a pooled connection, for long; a timed-out welcome is retried under the same idempotency key. Unsubscribe links (`src/lib/unsubscribe.ts`) are signed with **`UNSUBSCRIBE_SECRET`** (32+ characters, set in Vercel Production and Preview); locally a fixed development secret is used, and on Vercel without it no link is made and no welcome email is sent. `/{locale}/unsubscribe` asks before doing anything, and `POST /api/unsubscribe` is the RFC 8058 one-click endpoint for the `List-Unsubscribe` header; both mark the subscriber unsubscribed and switch a customer's opt-in off. Tables: customers, addresses, subscribers, auth_tokens, sessions, notification_log, refunds, drops, boxes, items, box_items, drop_boxes, settings, carts, inventory_holds, orders, order_items.

## Sign-in

Magic link + 6-digit code (D13, PRD 2.1), in `src/lib/auth.ts` with the pure rules in `auth-rules.ts`:

- **Request** (`/sign-in`, or the checkout's email step): one email with a link and a code, same answer whether or not the address has an account, rate-limited per email and per IP. Tokens live in `auth_tokens` as hashes, 15 minutes, single use; the code locks after 5 wrong tries.
- **Verify**: requesting a code sets a short-lived `ab-auth` flow cookie whose hash is stored on the token. The browser that asked redeems the link silently at `/{locale}/auth/verify` (and is the only one whose typed code counts); any other browser, or an email link scanner, is sent to `/{locale}/auth/confirm`, which names the masked address and needs a same-origin POST before any session changes, so a link can never switch someone's account without a deliberate click. First verified sign-in creates the customer (conflict-safe), converts a matching notify-me subscriber (PRD 2.7), and opens a 90-day session (`sessions` table, `ab-session` httpOnly cookie). `/account` shows who you are and signs out.
- **Rate limits** are checked and consumed under per-email and per-IP advisory locks, so a burst of concurrent requests gets exactly the allowance.
- **Checkout** places orders for the signed-in customer only; the confirmed delivery details become their saved profile and address (PRD 2.3). The magic link lands back on the checkout at the delivery step with the cart intact: its return path names this browser's reservation (`?r=<checkoutId>:<revision>`), which a fresh tab adopts only if it still matches the server exactly. The pending email and resend timer live per tab so a refresh of the code screen keeps working.
- **Email** goes through Resend (D23, Vercel Marketplace resource `resend-email-coquelicot-diamond`, Tokyo region) via `src/lib/email.ts`; every send is recorded in `notification_log`. The sending domain needs Resend's DKIM and SPF records at GoDaddy before `hello@astrobakes.xyz` can send; until then set `EMAIL_FROM="Astro Bakes <onboarding@resend.dev>"` for testing to your own address.

## Admin

The owner's portal (PRD §4) lives at **https://admin.astrobakes.xyz/admin**, served by this same app from `src/app/admin/` (its own root layout beside `[locale]`). English only, desktop only.

- **Hosts.** In production `/admin` answers only on `admin.astrobakes.xyz` (`src/proxy.ts` 404s it elsewhere), and that host serves nothing but the portal: `next.config.ts` sends its `/` to `/admin` and any shop path to `astrobakes.xyz`. Its `robots.txt` disallows everything and every admin page is noindex. On Vercel previews and locally there's no admin host, so open `/admin` on the deployment's own URL (`http://localhost:3000/admin`). Previews use the production database, so an admin on a preview edits real data.
- **Sign-in.** The shop's magic link + code with audience `admin` (`auth_tokens.audience`, `sessions.audience`): mail goes only to customers with `role = 'admin'` (everyone gets the same "check your email"), the link points at `/admin/auth/verify`, and the session lives in its own `ab-admin` cookie scoped to `/admin`. Admin and shop tokens and sessions are never accepted by the other side. A link opened in a browser other than the one that asked says to type the code instead; there's no confirmation page.
- **Who's an admin.** `pnpm admin:grant owner@example.com` (creates the account if needed; `--revoke` takes it away and ends their admin sessions). It prints which database it touched, since `.env.local` points at production.
- **Settings** (`/admin/settings`, PRD 4.9). The fields are listed once in `src/lib/settings-fields.ts`, and that list drives the form, the server-side validation and the defaults. Values are stored as `settings` rows.
  - **Public fields** reach pages through `loadSettings()`: contact email, Instagram and LINE links, the 特商法 fields and the expected-arrival offset. Saving refreshes the whole site. The shipping fee is shown but read-only. Placing an order reads the fee again, so changing it mid-checkout would charge a total the customer never saw. It becomes editable once checkout quotes shipping (the Stripe work).
  - **Private fields** are read only on the server, in `src/lib/settings.ts`: the owner email, the new-order toggle, and the Japan Post sender details and label options.
  - **Emails after payment.** `afterOrderPaid()` in `src/lib/order-paid.ts` sends the customer's confirmation and, when switched on, a "new order" email to the owner email (the contact email if that's empty). The Stripe webhook should call it too. Party requests go to `custom_order_email` if set, else the owner email, else the contact email.
  - **Not here yet:** allowed wards, payment toggles (with Stripe), the LINE QR (with photo uploads) and the per-item bake buffer (with the item editor).
- **Boxes & items** (`/admin/boxes`, `/admin/items`, PRD 4.3).
  - **Items** are what the kitchen bakes: a name in both languages, what it's baked as (cookie, cake…) and how many go into one (12 slices per cake).
  - **Boxes** have names, descriptions and card contents in both languages, a recipe of items with quantities (what the production sheet will add up), allergens, a price, a default cap and per-customer limit, a menu order and an active flag.
  - **Allergens** are checkboxes over `src/lib/allergens.ts`: the 特定原材料 (9, cashew included since the Consumer Affairs Agency's 2026-04-01 notice) and the 推奨表示 (19), stored by English name. The source and date are cited in that file. The shop's Japanese labels come from the same list.
  - **Slugs** are set when a box or item is created and never change: carts and links use them.
  - **Defaults only:** a box's price and caps are copied when a drop is set up, so editing a box never reprices an existing drop. Hiding a box takes it off the between-drops menu; a drop that carries it keeps selling it.
  - **Rules** live in `src/lib/catalogue-rules.ts` (shared with the forms); reads and writes in `src/lib/catalogue.ts`.
  - **Not here yet:** photo uploads (next PR) and the per-item bake buffer (with the production sheet).
- **Drops** (`/admin/drops`, PRD 4.2). The list shows each drop's state as the shop sees it now (the stored state moved on by the clock), its dates, sold against cap, paid orders and revenue.
  - **New drop:** a draft numbered after the last one (the number names the drop and its order numbers and can't change), with every active box at its defaults (D10). Drafts aren't on the shop.
  - **Times** are entered and shown in Japan time: open, close and bake as date-times, the ship date as a day.
  - **What can change depends on the state** (`editable()` in `src/lib/drop-rules.ts`). Before opening, everything. Once open, closed or baking: names, caps and per-customer limits, but not dates, boxes or prices, which customers have seen and may have paid. After that, only names.
  - **Caps** can never go below what's sold plus what checkouts hold right now, checked inside the save under the checkout's lock order. A box with sales can't be removed.
  - **Duplicate** makes the next-numbered draft with the same names, boxes, caps, prices and limits, every date a month later, and nothing sold.
  - **Not here yet:** scheduling, opening and closing, and the rest of the lifecycle (the next PR), and emailing customers when a ship date moves.
- **The rule.** Every admin page, route handler method and server action calls `await requireAdmin()` from `src/lib/admin.ts` in its own body (layouts and the proxy aren't boundaries). `src/app/admin/guard.test.ts` reads each file's syntax tree and fails when an entry point doesn't. That test is a safety net for parallel branches, not the boundary itself. The signed-out sign-in pieces call `assertAdminHost()` instead. New sections add themselves to `ADMIN_SECTIONS` in `src/components/admin/AdminNav.tsx`, and share the table and form styles in `src/app/admin/admin.module.css`.

## Account

`/account` (PRD 2.3–2.6, `src/lib/account.ts`): order history with the customer-facing status (Confirmed → Baking → Shipped → Delivered, Baking derived from the drop state), each order's page with items, address, dates and the delivery time slot (changeable until the drop closes), gift message, payment method and tracking, **cancel while the drop is open** (D22: order cancelled, stock returned, a `refunds` row recorded as owed until Stripe issues it, cancellation email), **order again** when the open drop carries the same boxes, the notification toggle (PRD 2.4), and name/phone/address/language editing with the same postal rules as the checkout. The order confirmation email (PRD 3.6) is sent after an order is placed. Email change and account deletion (PRD 2.6) are not built yet.

## Legal pages

`/legal/tokushoho`, `/legal/privacy` and `/legal/terms` (PRD 1.8), linked from the footer and the checkout. The copy lives in `src/lib/legal.ts` in both languages (Japanese is the authoritative text; the English page says so) and is covered by `legal.test.ts`. The 特定商取引法 table takes the seller fields from settings (PRD 4.9): `legal_seller_name`, `legal_operator`, `legal_address`, `legal_phone`, plus `contact_email`. Empty seller fields render the wording the law allows a sole proprietor, 「請求があったら遅滞なく開示します」, and the 運営責任者 row is left out; set the real values on the database before asking Stripe or PayPay to review the site, since their reviewers check that the page matches the account. The FAQ (`/faq`, PRD 1.7) uses the same chrome (`DocShell`): questions and answers live in `src/lib/faq.ts`, covered by `faq.test.ts`, with the contact address from settings; the keeping and freezing advice is a draft for the owner to confirm.

## Checkout write path

`src/lib/checkout.ts` (server only; pure rules in `checkout-rules.ts`), exposed to the client as server actions in `src/app/[locale]/checkout/actions.ts`:

- **Checkout →** calls `startCheckout`: inside a transaction that locks the drop's boxes it re-checks the cart against `cap − sold − active holds`, reports anything gone or cut, and otherwise writes a `carts` row plus 10-minute `inventory_holds`. The cart id goes in an httpOnly `ab-cart` cookie; the hold expiry comes back for the countdown.
- **Place order** calls `placeOrder`: with an unexpired held cart it creates the customer from the checkout email (unverified until sign-in exists), saves the address, takes the next per-drop sequence under a row lock (`AB-003-017`), writes `orders` + `order_items` with name and price snapshots, then `markPaid` sells the stock and releases the holds. Payment is **mocked**: `markPaid` runs immediately with a note on the order; the Stripe PR moves it into the webhook.
- **Delivery time slot** (D21): the delivery step offers Japan Post's slots (`src/lib/delivery-slots.ts`, rendered by `SlotOptions`); `placeOrder` stores it on `orders.delivery_time_slot` (missing = `none`, unknown = `invalid`). Customers can change it from the order page while the drop is open (`changeTimeSlot`, same window as cancellation).
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

FAQ, legal pages, account pages, the admin sections (§4.1–4.10; the portal's sign-in and shell exist), payment failure, PayPay "confirming…" page, Japanese copy, real photography, Stripe, any backend.
