# Astro Bakes — Website PRD

**Version:** 1 · 2026-10-06
**Scope:** the website only. Recipes, COGS, kitchen logistics, licensing and the launch checklist live in the operations doc — they're inputs here, not content.

---

## How to use this doc

- Every component has a checkbox: `[ ]` sketched · `[~]` specified, awaiting sign-off · `[x]` signed off, build from this.
- Each component covers four things only: what it does, what the user sees, what data it touches, open questions.
- Anything that doesn't fit under §1–5 is out of scope (end of doc). If it keeps coming up, it goes in the v1.1 list, not v1.

---

## What we're building

Astro Bakes sells small-batch, American-style bakes on a **drop model**: a drop opens for preorders, closes on a set date (or when every box sells out), everything is baked in one kitchen session, and every order ships by Japan Post on one ship date to addresses in Tokyo's 23 wards. The site is custom-built, bilingual (JA/EN), and has three jobs: make the drop model obvious and desirable to a first-time visitor, get a customer from "drop is open" to "order confirmed" on their phone in under two minutes, and give the owner a desktop admin to run a full drop cycle without touching code.

---

## Decisions

Settled constraints that the components below are written against. Referenced as D-numbers throughout.

**Scope & build**

| # | Decision |
|---|---|
| D1 | Custom-built site. No commerce platform. |
| D2 | Bilingual JA/EN. Locale lives in the URL (`/ja/…`, `/en/…`), defaults from the browser, is remembered on the account. Every customer-facing text field exists in both languages. The address form is always Japanese-format. |
| D3 | The homepage is the drop page. Past drops get archive pages in v1.1. |
| D4 | Real product photography exists; layouts assume it, placeholders until it's dropped in. |

**Drops & inventory**

| # | Decision |
|---|---|
| D5 | Fixed cap per box per drop. A box shows "sold out" when its cap is reached. |
| D6 | Exact remaining counts are shown on each box ("7 left"). |
| D7 | Limit of 5 of each box per customer per drop, across all of that customer's orders in the drop. |
| D8 | Entering checkout places a 10-minute hold on the boxes in the cart; the cap decrements for real on payment success. |
| D9 | A drop closes at its scheduled time, or early if every box sells out. |
| D10 | Each drop has a short name (e.g. "Drop 03 · October") and an optional description, and includes any subset of active boxes — default all of them. |
| D11 | No customisation. One optional gift message per order. |

**Accounts**

| # | Decision |
|---|---|
| D12 | An account is required to purchase. Notify-me does not require one. |
| D13 | Sign-in is by magic link. The email also carries a 6-digit code, because links opened from the LINE or Instagram in-app browser often land in a different browser than the one holding the cart. No passwords, no social login. |
| D14 | Account creation is offered from the landing page and in checkout. Checkout preserves the cart across sign-in. |
| D15 | One free-text name field; kanji or romaji. No furigana. |
| D16 | No saved payment methods and no phone verification in v1. |

**Money & fulfilment**

| # | Decision |
|---|---|
| D17 | Stripe, with cards and PayPay enabled. Stripe supports PayPay natively for Japan-based accounts, so this is one integration. |
| D18 | Prices and the shipping fee are stored and displayed tax-inclusive (総額表示). |
| D19 | Shipping is included in the box price; there is no separate fee. The settings key remains so a fee could return, and a non-zero fee shows as its own line. Changed from a flat per-order fee on 2026-10-20 — see changelog. |
| D20 | Delivery area is Tokyo's 23 wards, validated at address entry. |
| D21 | Japan Post. One ship date per drop, shown with the expected arrival date (ship date + 1, next-day within Tokyo); the customer chooses a delivery time slot at checkout but not the date. Changed from Yamato with nothing to choose on 2026-10-20 — see changelog. |
| D22 | Cancellation: free self-serve cancellation and full refund until the drop closes; none after. Refunds after close only for our failures (damage, non-delivery), handled manually by admin. *Placeholder policy — build for it, revisit if it bites.* |

**Notifications & admin**

| # | Decision |
|---|---|
| D23 | Email is the transactional channel, sent via Resend (provisioned through the Vercel Marketplace; Resend itself runs on Amazon SES). Changed from Amazon SES on 2026-10-19 — see changelog. |
| D24 | LINE in v1 is a broadcast channel: "notify me on LINE" means adding the Astro Bakes LINE Official Account, and announcements go out from LINE's own manager. Per-account LINE linking is v1.1. |
| D25 | Admin is desktop-only, with a single admin account (the owner's). |

---

## 1. Homepage

**Goal:** a first-time visitor understands what Astro Bakes is, sees the food, and understands "this is a drop bakery, the next drop is on X, here's how to get in" in one scroll. A returning visitor sees the current drop status — and their own order, if they have one — instantly.

**Page shape (top to bottom):** nav (1.6) → drop hero (1.1) → boxes (1.3) → how drops work (1.2) → story + photos (1.4) → notify-me (1.5) → footer (1.6). Single column on mobile; this page is where the Instagram and LINE traffic lands, on phones.

### [~] 1.1 Drop hero — this *is* the drop page

**What it does.** Reads the current drop's state (§5.2) and renders one of four variants. Everything a customer needs to decide and act is in this block or directly below it.

**What the user sees.**

| Drop state | Hero shows | Primary CTA |
|---|---|---|
| *Scheduled* (upcoming) | Drop name · "Opens [day, time] JST" with countdown · ship date · which boxes · shipping fee | Notify me (1.5). If signed in and opted in: "You're on the list." |
| *Open* | Drop name · "Closes [datetime] — or when sold out" · "Ships [date] · arrives [date + 1]" | "Choose your boxes" → scrolls to 1.3 with quantity pickers live. Sticky cart bar once anything is selected (3.3). |
| *Closed / Baking / Shipped* | "This drop is closed" · ship date · "Next drop: [date]" if one is scheduled | Notify me for the next one. If the signed-in viewer ordered in this drop: their order status inline ("Your 2 boxes ship Oct 25") linking to the order (2.5). |
| *No drop* (none scheduled) | Brand statement + photo | Notify me. |

Remaining counts and sold-out badges on boxes follow D6.

**Data.** Drop (state, name, open_at, close_at, ship_at), DropBox (cap, sold, held), the viewer's Order for this drop if any.

**Open.** Countdown precision — days/hours is enough; a ticking seconds timer feels like a sneaker drop and probably isn't the brand.

### [~] 1.2 How drops work

**What it does.** Three-step explainer so nobody is surprised that they can't order today or that it arrives in two weeks.

**What the user sees.** 1) Preorder during the drop window → 2) We bake everything in one session → 3) Japan Post delivers to your door the next day. Below: "Tokyo 23 wards only · shipping included · cancel free until the drop closes."

**Data.** Shipping fee and shipping area from settings (4.9). Otherwise static, bilingual.

### [~] 1.3 Boxes

**What it does.** The box cards. When the drop is open they *are* the ordering UI (behaviour in 3.1); otherwise they're the menu.

**What the user sees.** One card per box in the drop (or per active box, when no drop is open): photo, name, one-line description, contents list ("1 slice Nebula Banana Bread · 1 slice Midnight Chocolate Cake · 2 chocolate chip cookies"), allergen icons, price 税込. When open: quantity stepper and remaining count ("7 left" / "Sold out"). When not open: "In the next drop" / "Not in this drop".

**Data.** Box (name, description, contents via BoxItem, allergens, photos, price), DropBox (price override, cap, remaining).

**Open.** Whether to show boxes that aren't in the current drop at all. Proposal: only show the drop's boxes while a drop is scheduled/open; show all active boxes otherwise.

### [~] 1.4 Story + photos

**What it does.** Answers "what is this" for someone who arrived from a friend's Instagram story.

**What the user sees.** Two or three short paragraphs: American-style home baking, small batches baked in Nakameguro, Astro the dog. A photo grid — this is where the gooey cookie photos go (D4). Instagram link. No embedded feed in v1 (slow, and it would be the only third-party script on the page).

**Data.** Static, bilingual. Photos as static assets.

### [~] 1.5 Notify-me capture

**What it does.** Top of the funnel. Captures an email, or points to LINE, without requiring an account (D12).

**What the user sees.** Email field + "Tell me when the next drop opens" + consent line ("We'll only email you about drops. Unsubscribe any time."). Success state in place. Beside it: "Or add us on LINE" → LINE add-friend button / QR (D24). If the viewer is signed in, the email field is replaced by their notification toggle (2.4).

**Data.** Subscriber (email, locale, source=homepage, consented_at). Single opt-in with explicit consent text satisfies 特定電子メール法; double opt-in isn't worth the friction at this scale.

**Built (2026-10-21).** Signups are stored (`src/lib/subscribe.ts`) and the success state appears only once they are: one row per email, normalised; signing up again refreshes the consent time and language and brings back an unsubscribed address. An email that already belongs to a customer is left alone (their own toggle, 2.4, governs it) with the same reply, so the form reveals no accounts. A honeypot field turns bots away quietly. Signed-in customers see a status with a link to their email settings when they are on the list, and a one-tap "Email me when Drop N opens" button when they are not; neither shows an email field. Still single opt-in, decided again on 2026-10-21 (see changelog): instead of a confirmation step, each visitor (hashed IP) gets 10 valid sign-up attempts an hour, counted in `signup_attempts` whatever happens to the address, so the limit can't be used to tell an account holder's address from a new one; the latest consent's IP hash is kept on the subscriber as part of the consent record. Every newly active address gets a welcome email with a one-click way out.

**Welcome email (built 2026-10-21).** Owed once per activation (new, or back after unsubscribing) and recorded on the subscriber, in its language. A failed send is retried when the person signs up again and in the background after later sign-ups, up to 5 tries within 7 days, under one idempotency key per activation; a welcome waiting for a missing `UNSUBSCRIBE_SECRET` goes out once it's set. Nothing is sent to an address that has since unsubscribed or become a customer. A plain confirmation of what they signed up for, not a promotion, so it stays a registration notice; next to the notice, "Didn't sign up? Unsubscribe in one click", and a footer with the sender's name, the contact address and the 特商法 page.

**Unsubscribe (built 2026-10-21).** One signed link per address (`src/lib/unsubscribe.ts`, HMAC under `UNSUBSCRIBE_SECRET`) works for subscribers and customers alike. Opening `/{locale}/unsubscribe` only asks, because mail scanners fetch links; its button does it. The done page offers both ways back without revealing whether the address has an account: account holders sign in and switch emails on in their settings (the anonymous form can't do it for them), everyone else signs up again on the homepage. Mail clients get `List-Unsubscribe` and `List-Unsubscribe-Post` headers for their own one-click button (RFC 8058, `POST /api/unsubscribe`). Unsubscribing marks the subscriber row and switches a customer's opt-in off; order and sign-in emails are unaffected. Every drop announcement (4.8) uses the same link and headers. Before the first announcement, the sender's address must be published on the linked 特商法 page (特定電子メール法: the name and the unsubscribe notice go in the email, the address and a complaints contact may be on a linked page).

### [~] 1.6 Global nav & footer

**Nav.** Logo · drop-status pill ("Open · closes in 2d" / "Next drop Nov 8" / "Closed") · JA/EN toggle · cart icon with count (only while a drop is open) · "Sign in" or account avatar.

**Footer.** FAQ · Contact (email) · Instagram · LINE · 特定商取引法に基づく表記 · プライバシーポリシー · 利用規約 · © Astro Bakes.

**Data.** Drop state for the pill; cart count.

### [~] 1.7 FAQ

Static bilingual page, owner-written. Questions to cover: when are drops · where do you deliver (23 wards; no, not Yokohama) · shipping (included in the price) · how it's packed and delivered · how long things keep and freezing · allergens and the kitchen's shared-equipment note · can I cancel (D22) · is there a limit per person (yes, 5 of each box per drop) · can I choose a delivery date or time (the date no — every box ships on the drop's ship date and arrives the next day; a time slot yes, chosen at checkout) · can I send it as a gift (yes, gift message + any 23-ward address) · can I pick up (no) · what's "American-style".

Content lives in code/markdown in v1; an admin editor for FAQ isn't worth building.

### [~] 1.8 Legal pages

Three static pages, both languages. Content is the owner's responsibility; the site just renders it, with the 特商法 fields coming from settings (4.9) so they stay in sync with the checkout confirmation screen.

- **特定商取引法に基づく表記** — required items for 通信販売: 販売業者名 · 運営責任者 · 所在地 · 電話番号 · メールアドレス · 販売価格 (税込) · 商品代金以外の必要料金 (送料) · 支払方法と支払時期 · 商品の引渡時期 (ship date per drop) · 返品・キャンセルについて (D22) · 販売数量の制限 (caps per box and the 5-per-customer limit — one of the required disclosures and a real feature of the model, so say it plainly).
- **Privacy policy** — what we collect (name, email, phone, address, order history), why, Stripe as processor, retention, deletion on request.
- **Terms** — drop-model terms: preorder, cap, single ship date, cancellation per D22.

### [ ] 1.9 Drop archive — v1.1

`/drops` listing past drops: name, date, photos, what was in it, "sold out in 40 minutes". Nice for brand, zero effect on revenue. Sketched only; build after v1 ships.

---

## 2. Account creation

**Goal:** accounts are required to buy (D12), so the account must cost about thirty seconds and be created at the moment the customer is most motivated — in checkout — without losing their cart. Notify-me (1.5) is the top of the funnel and needs no account.

### [~] 2.1 Sign-in — magic link + code

**What it does.** One flow for new and returning customers. Enter email → we send one email containing a sign-in link *and* a 6-digit code (D13). Clicking the link or typing the code on the waiting screen signs you in. If the email is new, the account is created on first verified sign-in.

**What the user sees.** Email field → "Check your email" screen with a code input and "Resend" (after 30 s). Link and code expire after 15 minutes and are single-use. Same response whether or not the email exists (no enumeration). On success: back to wherever they started (checkout step 2, or the account page).

**Data.** Customer (email, email_verified_at, locale, created_at), AuthToken (token_hash, code_hash, expires_at, used_at). Session: long-lived cookie (90 days), explicit sign-out.

**Provider.** Resend (D23). Deliverability to docomo/au/SoftBank carrier addresses is the Japan-specific risk — set up SPF/DKIM/DMARC on the sending domain from day one and test against real carrier addresses before the first drop.

### [~] 2.2 Where sign-up happens

**Entry points.** (a) "Sign in" in the nav; (b) a CTA on the landing page ("Create an account so checkout takes ten seconds on drop day"); (c) checkout, which is where most accounts will actually be created (D14).

**Checkout flow.** Boxes → cart → *email* → code/link → (first time only) name, phone, address → gift message → payment → confirmation. The cart survives sign-in: it's stored client-side until sign-in, then attached to the account server-side, and the magic link lands on `/checkout`, not the homepage.

**Rule.** Never ask for anything before the step that needs it. Name and address are asked at the delivery step, not at account creation, and are saved to the profile from there.

### [~] 2.3 Profile

**Fields.**
- **Name** — one free-text field, kanji or romaji (D15). Required. Printed on the Japan Post label.
- **Email** — login identity.
- **Phone** — required; Japan Post needs it on the label. JP format validation, stored normalised.
- **Address** — 郵便番号 (7 digits) → auto-fills 都道府県 / 市区町村 / 町域 via postal-code lookup; then 番地 and 建物名・部屋番号 free text. Validated to one of the 23 wards (D20) at entry, with a friendly "we only deliver within Tokyo's 23 wards right now" if not. One saved address in v1; checkout prefills it and lets you edit, and the edited address becomes the saved one.
- **Locale** — JA/EN, set from the URL on first sign-in, editable.

**Data.** Customer (name, phone, locale, marketing_opt_in), Address (customer_id, postal_code, prefecture, city, line1, line2, ward_code).

**Open.** Postal-code lookup source — bundle Japan Post's KEN_ALL data or call a free API (zipcloud). Bundling avoids a runtime dependency on drop day; it's a 12 MB file that changes monthly. Lean bundle.

### [~] 2.4 Notification preferences

**What the user sees.** One toggle: "Email me when a drop is announced or opens" (default on at account creation, with consent text shown). Transactional emails (confirmation, shipped) aren't optional and aren't listed as a toggle. LINE: "Add us on LINE" link (D24); a "Connect your LINE account" option is v1.1.

**Data.** Customer.marketing_opt_in. See 2.7 for how this relates to Subscriber.

### [~] 2.5 Order history

**What the user sees.** List: drop name, order date, boxes, total, status in plain words (Confirmed → Baking → Shipped → Delivered — mapped from §5.2b). Order page: items, delivery address, ship date and expected arrival with the delivery time slot (changeable until the drop closes, D21), gift message, payment method, Stripe receipt link, Japan Post tracking number once shipped, and a **Cancel order** button while the drop is still open (D22). "Order again" adds the same boxes to the cart if the current drop is open and includes them.

**Data.** Order, OrderItem (with price and name snapshots — box prices can change between drops).

### [~] 2.6 Account management

Edit name / phone / address / locale. Change email (magic link sent to the *new* address to verify). Delete account: soft-delete; orders are retained for bookkeeping (帳簿保存) with name/address scrubbed after the retention period; the email is released so they could sign up again. Sign out.

### [~] 2.7 Subscriber → customer

**What it does.** A notify-me email (1.5) is a Subscriber, not a Customer. When that email later creates an account, the opt-in carries over, the Subscriber row is marked converted, and announcements (4.8) dedupe by email across both tables so nobody gets two copies. Unsubscribe links work for both (1.5: one signed link per address, which marks the subscriber unsubscribed and switches a customer's opt-in off).

**Data.** Subscriber (email, locale, source, consented_at, unsubscribed_at, converted_customer_id).

---

## 3. Drop experience

**Goal:** from "drop is open" to "order confirmed" in under two minutes on a phone, with zero ambiguity about what you're getting and when it arrives.

**Flow.** Homepage (open) → pick boxes (3.1) → cart bar (3.3) → sign in (2.1) → delivery details (3.4) → payment (3.5) → confirmation (3.6) → comms (3.7).

### [~] 3.1 Box selection

**What it does.** Pick a quantity of each box in the open drop, from the homepage cards (1.3).

**What the user sees.** A stepper on each card, 0 to 5 (D7). Changing a quantity updates the sticky cart bar (3.3) immediately. Each box shows its remaining count ("7 left"), refreshed on page load and after each cart change; "Sold out" at zero. Sold-out boxes keep their card but lose the stepper.

**Rules.** Remaining = cap − sold − active holds (D8). Stepper max = min(remaining, 5 − what this customer has already ordered of this box in this drop) (D7). Before sign-in the stepper allows up to 5; the per-customer part is re-checked at checkout.

**Data.** DropBox (cap, max_per_customer, price), active InventoryHold sum, this customer's paid and pending OrderItems in the drop.

### [~] 3.2 Gift message

**What it does.** The one customisation (D11). Optional, per order, up to 150 characters, printed on a card and packed in the box. Combined with the free delivery address (recipient name and address don't have to match the account), this covers the gift case without a separate flow.

**Data.** Order.gift_message, Order.ship_to_name.

### [~] 3.3 Cart

**What it does.** Holds the selection until checkout. Client-side until sign-in, then attached to the account.

**What the user sees.** Sticky bar on the homepage: "2 boxes · ¥4,600 · Checkout →". Tapping expands: line items with steppers, subtotal, "shipping included" (D19), total 税込. On "Checkout": inventory re-check — if a box no longer has enough remaining, the quantity is reduced with a visible message before continuing. Once signed in, the same check applies the per-customer limit (D7).

**Rules.** A cart belongs to one drop. When the drop closes, the cart is cleared and the bar says so.

**Data.** Cart (customer_id or anonymous, drop_id, items JSON, updated_at).

### [~] 3.4 Checkout

**What it does.** Three short steps on one page, order summary pinned. Entering checkout places the inventory hold (D8) and creates the Order in `pending_payment`.

**Steps.**
1. **Sign in** (2.1) — skipped if already signed in.
2. **Delivery** — recipient name (prefilled with account name), phone, address (prefilled; 23-ward validation), gift message (3.2). Ship date and expected arrival are shown, not chosen; the delivery time slot is chosen here (D21): 希望なし, 午前中, 12–14, 14–16, 16–18, 18–20 or 19–21 (Japan Post ゆうパック's slots), and can be changed from the order page until the drop closes.
3. **Pay** (3.5).

**Final confirmation screen.** Before payment, show everything the 2022 特商法 amendment requires on the 最終確認画面: items and quantities, unit and total prices 税込, shipping fee, payment method, delivery timing (ship date, expected arrival date and the chosen time slot), and the cancellation terms (D22) — with a "Place order" button whose label makes the commitment clear.

**Data.** Order (drop_id, customer_id, state, ship_to_name, phone, address snapshot, gift_message, delivery_time_slot, subtotal, shipping_fee, total, locale), OrderItem (box_id, name snapshot, qty, unit_price), InventoryHold (drop_box_id, order_id, qty, expires_at).

**Hold TTL.** 10 minutes (D8). PayPay's redirect to the app and back is the slowest path; 10 minutes covers it.

### [~] 3.5 Payment

**What it does.** Stripe Payment Element with cards and PayPay enabled (D17). Amounts in JPY (zero-decimal currency in Stripe). 3-D Secure is handled by Stripe.

**Rules.**
- The order becomes `paid` only on the `payment_intent.succeeded` **webhook**, never on the client returning. PayPay's return URL lands on a "confirming…" page that waits for the webhook.
- On failure: error in place, hold kept until TTL, retry allowed.
- Our confirmation email (3.6) is the receipt; Stripe's own email receipts stay off to avoid two emails.
- Refunds are issued through Stripe from admin (4.4). Stripe's processing fee isn't returned on refund; at this scale, accept it.

**Data.** Order.stripe_payment_intent_id, payment_method_type, paid_at. Refund (order_id, amount, stripe_refund_id, reason).

### [~] 3.6 Confirmation

**On screen.** "You're in." Order number, boxes, delivery address, ship date and expected arrival, what happens next (we bake on the bake day → ships → arrives), link to the order page, "Add us on LINE" nudge.

**Email.** Same content in the customer's locale, plus the cancellation terms and links to the 特商法 page and order page. Sent on `paid`.

**Owner.** Optional "new order" email to the owner, toggled in settings (4.9), default on — a solo operator wants the ping.

**Data.** NotificationLog (type, to, order_id, sent_at, provider_message_id).

### [~] 3.7 Post-order comms

| When | Message | Channel (v1) |
|---|---|---|
| Drop closes | *Optional*, admin-triggered: "The drop's closed — we bake on [date], your box ships [date]." | Email |
| Admin marks order shipped / imports tracking (4.6) | "Your box is on its way" with the Japan Post tracking number and link | Email |
| Delivered | Nothing in v1 (would need tracking polling) | — |

LINE for transactional messages is v1.1 (D24).

**Data.** Order.shipped_at, tracking_number; NotificationLog.

### [~] 3.8 Edge states & policies

- **Drop closes (time) while someone is in checkout.** Orders in `pending_payment` with an unexpired hold may complete within the hold; no new checkouts after close. The homepage flips to closed immediately.
- **Sells out while in cart.** Caught by the re-check on entering checkout (3.3); quantity reduced with a message, or box removed.
- **Hold expires before payment completes.** On expiry we try to cancel the PaymentIntent. If it succeeds anyway (race), accept the order and flag it on the admin dashboard — a bakery can bake one extra box; it can't un-charge a customer gracefully.
- **Payment fails.** Retry in place (3.5).
- **Customer cancels before close** (D22). Self-serve from the order page → full Stripe refund → inventory returned → cancellation email.
- **Customer wants to cancel after close.** No self-serve; the order page shows the policy and a contact link. Admin can still cancel and refund manually (4.4).
- **Two orders from one customer in a drop.** Allowed, up to 5 of each box across all their orders in the drop (D7); the stepper and the checkout re-check both enforce it.
- **Undeliverable / returned parcel.** Manual, between the owner and Japan Post. Admin can note it on the order.

---

## 4. Admin UX

**Goal:** the owner runs a full drop cycle — set up, open, watch orders, bake, ship, close — from a desktop browser (D25), without help. Plain forms and tables; one admin account (the owner's, same magic-link sign-in with `role = admin`).

**Admin nav.** Dashboard · Drops · Boxes · Orders · Customers · Announcements · Settings.

### [~] 4.1 Dashboard

**What the owner sees.** The current or next drop as a card: state, countdown to open or close, orders count, per-box sold/cap bars, gross revenue 税込, unshipped count, flagged orders (3.8 oversell race). Quick actions: *Open now · Close now · Production sheet · Packing list*. Below: the last ten orders. If nothing is scheduled: "Create a drop".

**Data.** Aggregates over Drop, DropBox, Order.

### [~] 4.2 Drops

**List.** Every drop: name, state, open/close/ship dates, sold/cap, revenue.

**Create / edit.** Name (ja/en), description (ja/en, optional), open_at, close_at, bake date (internal, optional), ship_at (expected arrival = ship_at + the offset in 4.9), boxes included (pick from active boxes — D10) with per-drop cap, price (defaults from the box), per-customer limit (default 5, D7). Save as draft or schedule.

**Actions.** Schedule · Open now · Close now · Reopen (if before ship) · Mark baking · Mark shipped (bulk, usually via 4.6) · Complete · Cancel drop (refunds every order — double confirm) · **Duplicate** (copies boxes and caps, clears dates — this is how a monthly drop takes two minutes to set up) · **Preview as customer** (renders the homepage with this drop forced).

**Guard rails.** Can't set a cap below units already sold. Changing ship_at after orders exist warns and offers to email affected customers.

**Data.** Drop, DropBox.

### [~] 4.3 Boxes & items

**Boxes.** Name (ja/en), description (ja/en), **contents** as a structured list of items with quantities (this is what makes the production sheet work), allergens (特定原材料 8 品目 checkboxes — 卵・乳・小麦・そば・落花生・えび・かに・くるみ — plus free text for the recommended 20), price 税込, photos (upload, ordered), active flag, default cap, default per-customer limit.

**Items.** The things that get baked: name (ja/en), production unit (loaf / cake / batch), units per production unit (8 slices per loaf, 14 cookies per batch, whole loaf = 1). Example items: Nebula Banana Bread slice · Nebula Banana Bread whole loaf · Midnight Chocolate Cake slice · Chocolate chip cookie · Matcha white chocolate cookie · Red velvet cookie · Double chocolate cookie.

**Data.** Box, BoxItem (box_id, item_id, qty), Item.

### [~] 4.4 Orders

**Table.** Order #, customer, boxes summary, total, payment method, state, created. Filters: drop, state; search by name or email. CSV export (accounting).

**Order detail.** Everything the customer sees, plus timeline (created → paid → packed → shipped), internal notes, and actions: cancel & refund (full; returns inventory if the drop is still open) · partial refund (amount; no inventory change) · edit recipient/address (until shipped) · add tracking number & mark shipped · resend confirmation email.

**Data.** Order, OrderItem, Refund.

### [~] 4.5 Production sheet

**What it does.** The bridge from orders to the kitchen — replaces the hand calculation in the operations doc.

**Calculation.** For each Item: needed = Σ over paid orders of (OrderItem.qty × BoxItem.qty). To bake = ⌈ needed ÷ units_per_production_unit ⌉ + buffer (per-item field, e.g. +1 loaf for sliced items, +0 for cookies by batch).

**What the owner sees.** For the selected drop, live while open (a projection) and final once closed:

| Item | Needed | Unit | To bake |
|---|---|---|---|
| Nebula Banana Bread (slices) | 18 | 8 / loaf | 3 loaves |
| Nebula Banana Bread (whole) | 2 | 1 | 2 loaves |
| Midnight Chocolate Cake (slices) | 12 | 8 / cake | 2 cakes |
| Chocolate chip cookie | 44 | 14 / batch | 4 batches |
| … | | | |

Plus: boxes to assemble by type, count of gift messages, and a Print button.

**Data.** Derived from Order, OrderItem, BoxItem, Item. Nothing stored.

**Open.** Whether the owner also wants a "slices needed vs. slices baked" variance after the fact. Probably not for v1.

### [~] 4.6 Packing & shipping

**Pack list.** One row per paid order, sorted by order #: order #, recipient, boxes by type and qty, gift message (text, highlighted). A checkbox per order persists `packed_at`. Printable.

**Japan Post export.** Export a CSV in the layout Japan Post's label tool accepts (exact columns to confirm with the owner; this section was written for Yamato's B2クラウド before 2026-10-20 and the round trip below is the model): recipient name, postal code, address, phone, お届け希望日 (the drop's expected arrival date, or blank for fastest), 品名 ("焼き菓子"), sender details from settings, and the order # in the お客様管理番号 field. The owner imports it into B2, prints labels, then exports B2's result CSV (which includes the 伝票番号) and **imports it back** — we match on order #, set tracking numbers, mark shipped, and send the shipped emails (3.7) in one go. Manual fallback: paste a tracking number on any order.

**Data.** Order.packed_at, shipped_at, tracking_number.

### [~] 4.7 Customers & subscribers

**Customers.** Name, email, orders, total spent, last order, marketing opt-in → detail with order list. **Subscribers.** Email, source, consented, converted. CSV export of both. Manual unsubscribe. No editing of customer PII from admin beyond that — customers edit their own.

### [~] 4.8 Announcements

**Compose.** Title (ja/en), body (ja/en, simple markdown), audience = everyone opted in (customers with opt-in + unconverted subscribers, deduped), optional send_at. Templates prefilled from the drop: "Drop announced — opens [date]" · "The drop is open" · "Closing tomorrow" · "Closed — baking on [date]" (3.7). Preview per locale; test-send to self; send log with counts and bounces.

**LINE.** v1: a "Copy for LINE" button that gives the text to paste into LINE Official Account Manager's broadcast (D24). v1.1: Messaging API broadcast from here.

**Data.** Announcement, AnnouncementSend.

### [~] 4.9 Settings

- **Store** — name, contact email, Instagram URL, LINE OA link and QR.
- **Shipping** — fee 税込 (D19; 0 = included, the default), allowed wards (default all 23), expected-arrival offset (default ship date + 1), Japan Post sender name/address/phone, service type (常温 / クール).
- **Payments** — keys live in environment config, not the UI; toggles for card / PayPay.
- **Legal** — 特商法 fields rendered into 1.8 and the checkout confirmation; cancellation policy text (D22).
- **Notifications** — "email me on each new order" (3.6), owner email address.
- **Production** — per-item bake buffer (4.5).

### [~] 4.10 Reporting

Per drop: boxes sold by type vs. cap, gross revenue, refunds, net, time-to-sell-out per box, orders by ward, new vs. returning customers. Lifetime: customers, repeat rate. Simple tables and CSV export; no charts in v1.

---

## 5. Cross-cutting

### [~] 5.1 Data model

Every customer-facing text field is stored in both languages (`name_ja`, `name_en` or a `{ja, en}` JSON column — implementation detail). Times stored UTC, displayed JST.

| Entity | Key fields |
|---|---|
| **Drop** | slug, name, description, state, open_at, close_at, bake_at (internal), ship_at, created_at |
| **DropBox** | drop_id, box_id, cap, max_per_customer, price (snapshot), sold_qty, sort |
| **Box** | slug, name, description, price, allergens[], photos[], active, default_cap, default_max_per_customer |
| **Item** | name, production_unit, units_per_production_unit, bake_buffer |
| **BoxItem** | box_id, item_id, qty |
| **Customer** | email, email_verified_at, name, phone, locale, marketing_opt_in, role (customer / admin), created_at, deleted_at |
| **Address** | customer_id, postal_code, prefecture, city, line1, line2, ward_code |
| **Subscriber** | email, locale, source, consented_at, unsubscribed_at, converted_customer_id |
| **AuthToken** | email, token_hash, code_hash, expires_at, used_at |
| **Cart** | customer_id (nullable), drop_id, items JSON, updated_at |
| **InventoryHold** | drop_box_id, order_id, qty, expires_at |
| **Order** | number (human-readable, e.g. `AB-003-017` = drop 3, order 17), drop_id, customer_id, state, ship_to_name, phone, address snapshot, gift_message, delivery_time_slot (none, morning, 12_14 … 19_21; default none), subtotal, shipping_fee, total, locale, stripe_payment_intent_id, payment_method_type, paid_at, cancelled_at, packed_at, shipped_at, tracking_number, notes |
| **OrderItem** | order_id, box_id, name snapshot, qty, unit_price |
| **Refund** | order_id, amount, stripe_refund_id, reason, created_at |
| **Announcement / AnnouncementSend** | title, body, audience, send_at, sent_at; per-recipient status |
| **NotificationLog** | type, to, order_id, sent_at, provider_message_id |
| **Settings** | key / value |

### [~] 5.2 State machines

**a) Drop** — the single source of truth that the homepage (1.1), nav pill (1.6) and admin dashboard (4.1) all read from.

| From | To | Trigger | Side effects |
|---|---|---|---|
| draft | scheduled | admin: Schedule | Homepage shows *Scheduled* hero |
| scheduled | open | system at open_at, or admin: Open now | Homepage flips to *Open*; (optional) "drop is open" announcement if scheduled in 4.8 |
| open | closed | system at close_at, or when every box sells out (D9), or admin: Close now | Carts cleared; new checkouts blocked; in-flight holds allowed to finish |
| closed | open | admin: Reopen (only before ship_at) | — |
| closed | baking | admin | (optional) "closed — baking on" email |
| baking | shipped | admin, usually via the 4.6 tracking import | Per-order shipped emails |
| shipped | complete | admin, or system a few days after ship_at | — |
| draft / scheduled / open / closed | cancelled | admin: Cancel drop | Refund all paid orders; cancellation emails |

**b) Order**

`pending_payment` → `paid` (webhook) → `packed` (4.6 checkbox) → `shipped` (tracking) → `complete`. Side exits: `pending_payment` → `expired` (hold TTL; PaymentIntent cancelled); `paid` → `cancelled` (customer before close, or admin anytime; refund issued). Customer-facing labels: Confirmed · Baking (derived from the drop state) · Shipped · Delivered.

### [~] 5.3 Notifications

| Message | Trigger | Audience | Channel | Kind |
|---|---|---|---|---|
| Magic link + code | sign-in request | that email | Email | transactional |
| Order confirmation | order → paid | customer | Email | transactional |
| Order cancelled | customer or admin cancels | customer | Email | transactional |
| Shipped + tracking | order → shipped | customer | Email | transactional |
| Drop announced / open / closing soon / closed | admin sends (4.8) | opted-in customers + subscribers | Email; LINE broadcast via OA Manager (v1) | marketing |
| New order | order → paid | owner | Email | internal, toggle |
| Oversell flag / webhook failure | 3.8 race, Stripe webhook error | owner | Email | internal |

All email goes out through Resend (D23). Marketing emails carry sender identity and an unsubscribe link (特定電子メール法) and a `List-Unsubscribe` header; transactional emails don't offer unsubscribe. Every message exists in JA and EN; the recipient's locale picks. All sends logged.

### [~] 5.4 Auth & roles

Magic link for everyone (2.1). `Customer.role = admin` for the owner; admin routes require it. Stripe webhooks verified by signature. Magic-link requests rate-limited per email and per IP. Admin sessions last the same 90 days — it's one person on one laptop — but live in their own cookie on the admin host (see changelog 2026-10-21).

### [~] 5.5 Analytics

Minimal and cookie-banner-free: a self-hosted events table or Plausible/Umami. Events: page view (with drop state at the time), box stepper used, checkout started, sign-in completed, order paid, notify-me signup. Per-drop funnel appears in 4.10. No Google Analytics in v1.

### [~] 5.6 Non-functional

- **Mobile-first** customer site; desktop-only admin.
- **Drop-open spike.** Cache the homepage per drop state; do inventory math in a database transaction (atomic decrement or row lock on DropBox); a background job expires holds every minute. Expected scale is tens of orders in minutes, not thousands — correctness matters more than throughput.
- **i18n.** Locale in URL (D2); every string in both languages; address form always Japanese; dates shown in JST with the weekday (people plan around the weekday).
- **Images.** Photos are the heaviest asset; serve resized and lazy-loaded.
- **Backups.** Daily DB backup. Stripe is the system of record for money.
- **Retention.** Orders kept for the bookkeeping period after account deletion, PII scrubbed (2.6).
- **Stack.** Deliberately not in this PRD. It assumes a server-rendered web app, a relational database, a background job runner, and Stripe webhooks — anything that provides those works.

---

## v1 vs. v1.1

| v1 (launch) | v1.1 (after a few drops) |
|---|---|
| Everything marked `[~]` above | Drop archive pages (1.9) |
| LINE as a broadcast channel via OA Manager | LINE account linking + transactional LINE messages |
| Email announcements from admin | LINE Messaging API broadcast from admin |
| One saved address | Address book |
| | Delivered notification (tracking polling) |
| | Seasonal / one-off boxes per drop (the model supports it; the content doesn't exist yet) |

## Explicitly out of scope

- Recipes, COGS, pricing strategy, production timelines, kitchen booking → operations doc / spreadsheet
- Licensing, HACCP, labelling, PL insurance → launch checklist
- Delivery date choice, pickup, saved cards, phone verification, social login, box customisation (time-slot choice moved into scope on 2026-10-20, D21)
- Corporate gift boxes, subscriptions, loyalty, brick-and-mortar
- Marketing / Instagram strategy

## Build-time checks

Not decisions — things to verify when the relevant piece is built.

- PayPay is enabled on the Stripe account (3.5).
- B2クラウド CSV column layout matches the current template (4.6).
- Japan Post service type (常温 / クール) entered in settings (4.9).
- Email deliverability (Resend, D23) tested against docomo/au/SoftBank addresses before the first drop (2.1).

---

## Changelog

- **2026-10-21** — Notify-me stays single opt-in (1.5) rather than moving to double opt-in: a confirmation step would cost real sign-ups, and Japanese carrier addresses often filter unfamiliar senders, so confirmations would quietly never arrive. Instead, a per-visitor limit (10 sign-ups an hour) stops bulk abuse, a welcome email with a one-click unsubscribe lets anyone added without asking leave, and drop announcements carry the same unsubscribe link and headers. Revisit double opt-in if complaint rates climb.
- **2026-10-21** — Settings (4.9) are editable in the admin: store links and contact email, the 特商法 fields, the expected-arrival offset (used everywhere the arrival date shows), the owner email, the new-order toggle (3.6, now sent), and the Japan Post sender and label options. The shipping fee is shown but not editable until checkout quotes shipping and re-checks it before payment (with Stripe), because a mid-checkout change would otherwise charge a total the customer never saw. Allowed wards wait until the shop delivers to fewer than all 23. Payment toggles come with Stripe, the LINE QR with photo uploads, and the bake buffer with the item editor.
- **2026-10-21** — The admin (§4) lives at `admin.astrobakes.xyz/admin`, in the same app. It is English only (customer-facing content is still entered in both languages). It signs in through the same magic link and code, but its tokens and sessions are a separate audience, and its session sits in a host-only cookie scoped to `/admin`. Neither side accepts the other's, so the owner's shop account and admin session stay independent.
- **2026-10-21** — D21's delivery time slot is built: chosen at checkout (Japan Post ゆうパック's six slots plus 希望なし; the 20–21 slot was withdrawn in 2024), shown on the final confirmation screen, the done step, the confirmation email and the order page, and changeable from the order page in the same window as free cancellation (until the drop closes), so a label export made after close can't go stale. Stored as `orders.delivery_time_slot`, default `none`.
- **2026-10-20** — Three owner decisions overrode v1. D19: shipping is included in the box price, no separate fee; the cart bar, hero, chips, checkout, emails and order pages say "shipping included" and hide the fee line when the setting is 0 (the key stays so a fee could return). D21: the carrier is Japan Post, not Yamato, and customers choose a delivery time slot at checkout while the date stays the drop's ship date; the checkout field and the Japan Post label export are still to be built. Gift messages are handwritten, not printed. The legal pages and FAQ (1.7, 1.8) already say all of this.
- **2026-10-19** — D23 changed from Amazon SES to Resend, provisioned through the Vercel Marketplace: one-command setup with the API key injected into the project, versus an AWS account, IAM credentials and a sandbox-exit request for SES. The sending domain still needs DKIM/SPF at GoDaddy and the carrier-address deliverability test before the first drop; the email transport sits behind one interface so SES stays available as a fallback if volume or cost ever warrant it.
- **2026-10-06** — v0 component sketch written; fleshed out to v1 the same day; all decisions and open questions reviewed and settled (delivery date fixed to one ship date per drop; per-customer limit of 5 replaces a per-order max; exact stock counts; SES for email).
