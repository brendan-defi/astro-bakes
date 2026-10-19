--- page 1 ---
Astro Bakes — Website design handoff (V2 ·
Fun)
Oct 14, 2026  ·  @Brendan
Overview
Build the customer site from the V2 · Fun page of the Design canvas: the mobile and
desktop homepage in the drop-open state, and the buy flow from cart to confirmation.
Behaviour, data and rules come from the Website PRD (v1, 2026-10-06); this doc covers
only how it looks and reads.
Source of truth for behaviour: Website PRD, sections 1 (Homepage) and 3 (Drop
experience). Decision numbers (D1–D25) below refer to it.
Source of truth for look: the Design canvas, page "V2 · Fun". Its source files ship
alongside this doc as astro-bakes-design.zip: HTML with inline styles plus a light
template layer (its README explains it), so exact values can be lifted from them.
V1 · Planetarium on the same canvas is a rejected direction. Ignore it.
Not designed yet, build from the PRD and these tokens: drop-scheduled, closed and
no-drop hero states (1.1), FAQ, legal pages, account pages, admin.
Copy in the mocks is English. Every customer-facing string needs a Japanese version
(D2); the JA copy is not written yet.
Artboard What it shows
Fun.dc.html Homepage, mobile 390, drop open, working
steppers and cart bar
FunDesktop.dc.html Homepage, desktop 1280, drop open
Checkout.dc.html (+ 6 step artboards) Mobile buy flow, cart → confirmation, plus
sold-out-in-cart
CheckoutDesktop.dc.html (+ 6 step
artboards)
Desktop buy flow, same steps, two-column
layout
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 1 of 13

--- page 2 ---
Design tokens
The look is pastel "sticker" style: flat pastel fills, a thick deep-purple outline on everything,
and a hard offset shadow with no blur. Define these as CSS custom properties.
Color
Type (Google Fonts)
Token Hex Used for
ink #2A1B5E All text, every outline and hard shadow, ticker and
footer background
ground #FFF5FA Page background
lilac #CDB4FF Nav and hero background, step 3 badge
pink #FF9CCB Primary buttons, cart bar, active step dot
butter #FFE066 "How a drop works" band, alerts, "X left" starburst,
hold timer
aqua #7DE8E4 Notify-me band, "+" stepper button, selected
payment tile
pink-soft #FFD3E8 Cookie box tint, "orders close" ticket, gift note
butter-soft #FFF1B8 Banana bread tint, photo placeholders
aqua-soft #BFF3F0 "Arrives" ticket, shipping info strips
lilac-soft #F1E8FF Allergen chips, postal-code autofill box
lilac-tint #E7DDFB Sampler box tint
purple-logo #B14FE0 Logo wordmark
line-green #0A7A3B LINE button only
ok-green #075C2C on #DDF7E8 "We deliver to … ward" check
Role Font Notes
Display: headings, prices,
numbers, buttons
Titan One 400 h1 44px mobile / 74px desktop; h2
38 / 56px; line-height ~1.02
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 2 of 13

--- page 3 ---
Shape and depth
Border: 2.5px solid ink on cards, buttons, inputs, chips (2px on small chips).
Hard shadow: 4–7px 4–7px 0 ink  on cards; buttons use a straight-down 0 6px 0
ink .
Radius: 999px pills for buttons; 28px box cards; 20–24px panels; 14–16px inputs.
Tilt: cards and tickets rotate −1.5° to +1.5°, alternating. Never tilt form inputs or the
checkout's main column.
Spacing: page gutter 20px mobile / 40px desktop; content max-width 1120px.
Motion (all off under prefers-reduced-motion )
Ticker scrolls left continuously (22s mobile, 40s desktop loop).
Hero cookie "moon" bobs 8–10px over 4s; hero star spins once per 14s.
Shared components
Build these once and reuse them on the homepage and in checkout.
Role Font Notes
Body and all Japanese Zen Maru Gothic 500
/ 700 / 900
16px mobile, 17px desktop, line-
height 1.6; labels and emphasis at
900
Logo wordmark only Pacifico Purple on a white oval, rotated
−4°
Component Spec
Logo "Astro Bakes" in Pacifico, purple, on a white oval
with ink border and 3–4px hard shadow, rotated
−4°. Placeholder until the final logo exists.
Primary button Pink pill, ink border, 0 6px 0 ink  shadow, Titan
One 19–22px, min-height 60px. One per screen.
Secondary button White pill, ink border, Zen Maru 900. Used for Edit,
Sign in, View your order.
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 3 of 13

--- page 4 ---
Component Spec
Box card White, ink border, 28px radius, 6–7px hard shadow,
slight tilt. Photo area on top with its own bottom
border, then name + price, description, contents,
allergen chips, stepper.
Stepper − (white) and + (aqua) round buttons, 48px,
quantity between in Titan One. Max =
min(remaining, 5) per D7; disabled at bounds.
"X left" starburst 12-point butter starburst, ink stroke, rotated 12°,
overlapping the card's top-right corner. Shows the
exact count (D6).
Sold-out stamp Ink box, white text "SOLD OUT", rotated −9°, over
the photo. Card keeps its place; stepper is
replaced by a notify link.
Ticket card Small tilted panel: eyebrow in Titan One caps, value
in 900 weight. Used for "Orders close" and
"Arrives" in the hero.
Allergen chip lilac-soft pill, 2px ink border, 12px 900 weight.
Placeholder for allergen icons.
Info strip aqua-soft panel with a truck icon: "Ships Sun, Oct
25 · arrives Mon, Oct 26". Appears in cart, delivery
and review.
Alert butter panel, ink border, warning-triangle icon,
Titan One title + plain list. role="alert" .
Ticker Ink band, butter Titan One caps, pink and aqua
stars between items. Replaces the PRD's nav
status pill (1.6), so its text must come from drop
state.
Wave divider Full-width SVG scallop, ~30px tall, between hero
and boxes and above the yellow band.
Input 54–60px tall, 2.5px ink border, 14–16px radius, white
fill, label above in 900 weight. Japanese label
beside the English one in checkout.
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 4 of 13

--- page 5 ---
Icons are simple inline stroke SVGs (cart, clock, truck, check, warning, Instagram, paw). No
emoji.
Homepage (drop open)
One page, top to bottom, in this order; mobile single column, desktop two columns where
noted. Copy below is final English for the open state; dates and counts come from the
Drop and DropBox data.
# Section Background Layout Copy and content
1 Ticker ink Full width, scrolling "DROP 03 IS OPEN ★
CLOSES IN 2 DAYS ★
TOKYO 23 WARDS ★
SHIPS OCT 25". Screen
readers get one static
sentence via
role="status" .
2 Nav lilac Logo left; JA/EN
toggle, cart button
with count badge,
Sign in right
Cart button only while a
drop is open (PRD 1.6).
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 5 of 13

--- page 6 ---
# Section Background Layout Copy and content
3 Hero lilac Mobile: text, Astro
visual, tickets, CTA
stacked. Desktop:
text + tickets + CTA
left, Astro visual
right
Eyebrow sticker "DROP 03
· OCTOBER". h1
"American-style bakes,
launched one drop at a
time." (second half in
white with ink outline).
Sub: "Cookies and banana
bread, baked in small
batches in Nakameguro.
Order while a drop is
open; we bake everything
at once and deliver across
Tokyo's 23 wards." JA
tagline 「アメリカンスタイ
ルの⼿作りクッキー＆ベイ
ク」 . Tickets "ORDERS
CLOSE — Sun, Oct 18 ·
21:00 JST, or when sold
out" and "ARRIVES —
Mon, Oct 26, ships Sun,
Oct 25". CTA "Pick your
boxes ↓" scrolls to boxes.
4 Astro
visual
— Circular photo on a
butter "moon", pink
orbit ring, bobbing
cookie, spinning
star, speech bubble
Bubble: "Drop 03 is open!"
5 Boxes ground 1 column mobile, 3
desktop (auto-fit,
min 300px)
h2 "In this drop"; sub "Up
to 5 of each box per
person. Prices include
tax." Card per DropBox
(see Shared components).
Sold-out card text: "Sold
out this drop. Get a heads-
up next time" → #notify.
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 6 of 13

--- page 7 ---
# Section Background Layout Copy and content
6 Cart bar ink strip (mobile) /
floating (desktop)
Sticky to viewport
bottom once
anything is selected
"2 boxes · ¥1,500 + ¥[fee]
shipping · Checkout →" →
cart.
7 How a
drop
works
butter, wave on
top
3 tilted cards:
stacked mobile, row
desktop
Eyebrow "NEW HERE?"
h2 "How a drop works". 1
"Preorder during the drop
— Order while the drop is
open. Boxes are limited, so
some sell out early." 2 "We
bake it all at once — Every
order in the drop is baked
fresh in one kitchen
session." 3 "Delivered the
next day — Everything
ships by Yamato on one
date and arrives the day
after." Chips: "Tokyo 23
wards only", "¥[fee]
shipping", "Cancel free
until the drop closes".
8 Story ink with star dots Text + 2×2 tilted
polaroids
Eyebrow "BAKED IN
NAKAMEGURO", h2
"Meet Astro". "Astro is our
border collie, and the
name on the box. He
watches every bake from
the kitchen floor and has
never once been allowed a
cookie." + two short
paragraphs + "More Astro
on Instagram". Captions:
Head of QC, Gooey
middles, Nebula loaf, Bake
day.
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 7 of 13

--- page 8 ---
Other drop states (scheduled, closed, no drop) change only the ticker, hero tickets, CTA
and box cards, per PRD 1.1 and 1.3; reuse these components.
Buy flow
Six screens, cart to confirmation, following PRD 3.3–3.6. The 10-minute hold (D8) starts
when the customer leaves the cart; from then on a butter "9:52" countdown chip sits in
the header and a 3-step indicator (Sign in · Delivery · Pay) shows progress: current step
pink, done steps ink with white number.
Layout. Mobile: lilac header (back button, logo, hold chip), step indicator, a pinned order
summary strip on sign-in, code and delivery, then the step's content, one primary button
at the bottom. Desktop: same header with the steps inline; content on the left (flex 1.6), an
order summary card on the right (flex 1) that stays sticky, showing lines, subtotal,
shipping, total 税込  and the ship/arrival strip.
# Section Background Layout Copy and content
9 Notify-me aqua Form + LINE card
side by side on
desktop
h2 "Hear about the next
drop"; "We'll email you
when a drop is announced
and when it opens." Email
+ "Tell me when the next
drop opens"; consent line
"We'll only email you
about drops. Unsubscribe
any time." LINE card with
QR (desktop) and "Add
friend on LINE".
10 Footer ink Logo, link grid FAQ · Contact · Instagram ·
LINE · 特定商取引法に基づ
く表記  · プライバシーポリ
シー  · 利⽤規約  · © Astro
Bakes
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 8 of 13

--- page 9 ---
# Screen Content Primary action
1 Cart h1 "Your boxes". A row per box:
photo, name, unit price, stepper,
line total. "Up to 5 of each box
per person, per drop." Subtotal,
shipping · Tokyo 23 wards flat ¥
[fee], total 税込 . Ship/arrival
strip. Desktop puts the button in
the right column.
"Checkout →" (runs the
inventory re-check, 3.3).
Note: "Your boxes are held
for 10 minutes once you
start checkout."
2 Sign in h1 "Sign in to check out". "New or
returning, it's the same step.
We'll email you a sign-in link and
a 6-digit code. No passwords."
Email field. "Your boxes stay in
your cart while you sign in."
Skipped if signed in.
"Email me a sign-in code"
3 Email code h1 "Check your email". "We sent a
link and a code to
you@example.com. Tap the link,
or type the code here." One 6-
digit field ( inputmode=numeric ,
autocomplete=one-time-code ).
Tip in butter: "Opened the email
in LINE or Instagram? The link
may open in a different browser.
Typing the code here keeps your
cart." "Resend in 0:24" (30s),
"expire in 15 minutes".
"Continue"
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 9 of 13

--- page 10 ---
# Screen Content Primary action
4 Delivery h1 "Where should it go?" "We
deliver within Tokyo's 23 wards.
Sending a gift? Use the
recipient's name and address."
Fields: Recipient name お名前 ,
Phone 電話番号  ("Yamato prints
this on the label."), Postal code 郵
便番号  + "Look up", autofill box
(prefecture/city/town + green
"We deliver to Meguro-ku"),
Street number 番地 , Building,
room 建物名‧部屋番号
(optional). Ship/arrival strip:
"Every order in this drop ships
the same day, so there's no date
to pick." Checkbox "This is a gift
— add a message" reveals a 150-
char textarea with counter.
Prefilled from profile.
"Continue to payment".
Note: "We'll save this
address to your account
for next time."
5 Review and pay ( 最
終確認画⾯ )
Order lines with qty and unit
price, subtotal, shipping, total 税
込 . Deliver-to card with Edit, gift
message, ship/arrival. "Pay with"
Card / PayPay tiles (selected =
aqua + shadow); Card shows the
Stripe Payment Element; PayPay
shows "You'll go to the PayPay
app to approve…" (mobile) or
"We'll show a PayPay QR code…"
(desktop). Butter cancellation
note: "free, with a full refund,
until the drop closes (Sun, Oct 18,
21:00 JST). After that, orders
can't be cancelled." + 特商法  link.
"Place order and pay ¥
[total]" / "Place order · pay
with PayPay". Under it: "By
placing this order you
agree to the Terms and
confirm the details
above."
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 10 of 13

--- page 11 ---
The order becomes paid only on the Stripe webhook (3.5); PayPay's return lands on a
"confirming…" page that is not designed yet.
Edge states
One edge state is designed: boxes selling out while they sit in someone's cart (PRD 3.3,
3.8). It appears on the cart screen when the re-check on "Checkout →" finds a shortfall,
before the hold is placed.
Alert at the top of the cart, role="alert" : "A few boxes sold out while you were
shopping", then one bullet per change, then "Everything below is still available. Check it
over, then carry on."
Box gone: "Nebula Banana Bread sold out, so we've taken it out of your cart." Its row
stays in the list, dashed border, faded photo, name struck through, "SOLD OUT" tag,
link "Get a heads-up next drop".
Quantity cut: "Only 2 4 Cookie Boxes were left, so we've changed yours from 3 to 2."
The row shows the new quantity with + disabled.
Totals recalculate; the customer must press "Checkout →" again to continue.
The same pattern applies to the per-customer limit after sign-in (D7): "You've already
ordered 3 of these this drop, so we've changed yours to 2." (copy not in the mocks).
Not designed, build from the PRD with the same alert and card components:
Hold expired before payment (3.8)
Payment failed, retry in place (3.5)
PayPay "Confirming your payment…" return page (3.5)
Drop closed while browsing; cart cleared (3.3)
# Screen Content Primary action
6 Confirmation Lilac hero: Astro photo, h1 "You're
in.", "Order AB-003-017 is
confirmed. A confirmation email
is on its way to …". Order card.
"What happens next": drop
closes (cancel free until then) →
we bake every order at once →
ships by Yamato (tracking
emailed) → arrives.
"View your order";
secondary "Back to the
shop"; LINE card "Hear
about the next drop on
LINE".
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 11 of 13

--- page 12 ---
Postal code outside the 23 wards: "We only deliver within Tokyo's 23 wards right now."
(2.3)
Empty cart
Placeholders and open items
Everything in the mocks marked with brackets, and every date or count, is sample data.
Wire them to real data; do not ship the samples.
Open questions:
Item In the mocks Real source
Shipping fee, totals ¥[fee], ¥[total] Settings 4.9 (flat fee, 税込 )
Drop name, dates Drop 03 · October; closes Sun
Oct 18 21:00; ships Oct 25;
arrives Oct 26
Drop record; arrival = ship_at +
offset
Remaining counts 7 left, 3 left, sold out DropBox: cap − sold − active
holds
Box names, prices,
contents
4 Cookie Box ¥1,000; Nebula
Banana Bread ¥500; Sampler
Box ¥[price]
Box / BoxItem. "Sampler Box"
name and description are
invented.
Allergens Egg, Milk, Wheat, Walnut
chips
Box allergens. Mock values are
guesses; final design wants icons.
Product and story
photos
Labelled placeholder tiles Real photography (D4)
Astro photos Two low-res crops from the
old menu
Replace with originals
Recipient, address,
phone, email, order
number
⼭⽥  花⼦ , 〒 153-0061 ⽬黒区中
⽬黒  1-2-3, 090-1234-5678,
you@example.com, AB-003-
017
Customer, Address, Order
Hold countdown 9:52 InventoryHold.expires_at
Logo Typeset Pacifico on an oval Final logo, when designed
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 12 of 13

--- page 13 ---
Accessibility and implementation notes
Mobile first. Most traffic arrives from Instagram and LINE on phones; design at 390px,
then widen. Grids use repeat(auto-fit, minmax(min(300px, 100%), 1fr))  so they
collapse to one column.
Touch targets at least 44px; steppers are 48px.
Contrast. All text is ink on pastel or white on ink, which passes 4.5:1. Don't put white
text on pink, aqua or butter.
Real controls. Steppers, payment tiles and the gift toggle are <button>  / <input>
elements; payment tiles use aria-pressed ; icon-only buttons get aria-label  ("Add
one", "Remove one", "Back").
Decoration is hidden. Stars, orbit rings, wave dividers and the ticker's scrolling copy
are aria-hidden ; the ticker exposes one sentence through role="status" .
Motion stops under prefers-reduced-motion: reduce .
Tilt is a CSS transform on decorative containers only; text inside stays upright relative
to its card.
Japanese text uses Zen Maru Gothic throughout; Titan One has no Japanese glyphs,
so JA headings fall back to Zen Maru Gothic 900.
Dates show in JST with the weekday (PRD 5.6), e.g. "Sun, Oct 18 · 21:00 JST" / 「 10 ⽉ 18 ⽇
( ⽇ ) 21:00 」 .
Prices always tax-inclusive with 税込  beside them (D18).
Japanese copy for every string in this doc (D2).
Final shipping fee.
Allergen icon set.
Instagram and LINE account URLs and the LINE QR image.
Astro Bakes — Website design handoﬀ (V2 · Fun)
Page 13 of 13