import "server-only";
import { and, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { addresses, carts, customers, dropBoxes, drops, inventoryHolds, orderItems, orders, settings as settingsTable } from "@/db/schema";
import { effectiveState, settings as defaultSettings, type Locale } from "./data";
import { demoEnabled } from "./demo";
import { EMAIL, orderNumber, reconcile, validateDelivery, type DeliveryInput, type ReCheckChange } from "./checkout-rules";

export { reconcile, orderNumber, validateDelivery } from "./checkout-rules";
export type { ReCheckChange, Available, DeliveryInput } from "./checkout-rules";

/**
 * The checkout write path (PRD 3.3, 3.4, 3.8, D7, D8):
 *
 *   startCheckout  re-checks the cart against cap − sold − active holds inside a
 *                  transaction, then replaces the cart's holds and bumps its
 *                  revision. The cart row is identified by an httpOnly cookie.
 *   heldCheckout   finds a cart with unexpired holds, so a customer who started
 *                  before the drop closed can still finish (PRD 3.8).
 *   placeOrder     turns an unexpired held cart into an order, binding the
 *                  submission to the cart revision the customer was shown and
 *                  enforcing the per-customer limit across their orders in the
 *                  drop. markPaid() sells the stock and releases the holds; until
 *                  Stripe is wired it runs immediately (mock payment).
 *
 * Locking: both writers lock the cart row first, then the drop's rows, so two
 * tabs or two concurrent submissions serialise instead of racing.
 * Server only. The pure rules live in checkout-rules.ts so they can be tested.
 */

export type Conn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- helpers

async function setting<T>(conn: Conn, key: string, fallback: T): Promise<T> {
  const [row] = await conn.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, key));
  return row && typeof row.value === typeof fallback ? (row.value as T) : fallback;
}

/** Row-lock a cart for the rest of the transaction; null when it no longer exists. */
async function lockCart(tx: Conn, id: string) {
  const [row] = await tx.select().from(carts).where(eq(carts.id, id)).for("update");
  return row ?? null;
}

const holdsOf = (tx: Conn, cartId: string) =>
  tx.query.inventoryHolds.findMany({ where: eq(inventoryHolds.cartId, cartId), with: { dropBox: { with: { box: true } } } });

interface DropBoxAvail {
  left: number;
  maxPerCustomer: number;
  dropBoxId: string;
  boxId: string;
  price: number;
  nameEn: string;
  nameJa: string | null;
}

/** Remaining per box slug for a drop: cap − sold − active holds (D8), ignoring the caller's own cart. */
export async function availability(conn: Conn, dropId: string, excludeCartId: string | null): Promise<Map<string, DropBoxAvail>> {
  const rows = await conn.query.dropBoxes.findMany({ where: eq(dropBoxes.dropId, dropId), with: { box: true } });
  const held = new Map<string, number>();
  if (rows.length) {
    const sums = await conn
      .select({ dropBoxId: inventoryHolds.dropBoxId, qty: sql<number>`coalesce(sum(${inventoryHolds.qty}), 0)::int` })
      .from(inventoryHolds)
      .where(
        and(
          inArray(inventoryHolds.dropBoxId, rows.map((r) => r.id)),
          gt(inventoryHolds.expiresAt, new Date()),
          sql`${inventoryHolds.cartId} is distinct from ${excludeCartId}::uuid`,
        ),
      )
      .groupBy(inventoryHolds.dropBoxId);
    for (const s of sums) held.set(s.dropBoxId, s.qty);
  }
  return new Map(
    rows.map((r) => [
      r.box.slug,
      {
        dropBoxId: r.id,
        boxId: r.boxId,
        price: r.price,
        nameEn: r.box.nameEn,
        nameJa: r.box.nameJa,
        left: Math.max(0, r.cap - r.soldQty - (held.get(r.id) ?? 0)),
        maxPerCustomer: r.maxPerCustomer,
      },
    ]),
  );
}

// ---------------------------------------------------------------- start checkout

export interface StartInput {
  /** Drop slug, e.g. "drop-03". */
  dropId: string;
  items: Record<string, number>;
  /** Demo switches from the URL; honoured outside production only. */
  flags?: { state?: string | null; demo?: string | null };
}

export type StartResult =
  | {
      ok: true;
      /** Null when the re-check changed the cart: nothing is held until the customer presses Checkout again. */
      checkoutId: string | null;
      revision: number | null;
      expiresAt: number | null;
      items: Record<string, number>;
      changes: ReCheckChange[];
      left: Record<string, number>;
    }
  | { ok: false; error: "drop_closed" | "empty" };

export async function startCheckout(input: StartInput, cartId: string | null): Promise<StartResult> {
  const db = getDb();
  const drop = await db.query.drops.findFirst({ where: eq(drops.slug, input.dropId) });
  if (!drop) return { ok: false, error: "drop_closed" };
  const now = new Date();
  const live = effectiveState({ ...drop, arriveAt: new Date(drop.shipAt.getTime() + DAY) }, now) === "open";
  const demoOpen = demoEnabled && input.flags?.state === "open";
  if (!live && !demoOpen) return { ok: false, error: "drop_closed" };
  const holdMinutes = await setting(db, "hold_minutes", defaultSettings.holdMinutes);

  return db.transaction(async (tx) => {
    // Cart lock first (same order as placeOrder), then the drop's boxes so two carts can't both take the last one.
    let cart = cartId && UUID.test(cartId) ? await lockCart(tx, cartId) : null;
    if (cart && cart.dropId !== drop.id) {
      await tx.delete(carts).where(eq(carts.id, cart.id)); // a leftover from another drop; its holds go with it
      cart = null;
    }
    await tx.execute(sql`select id from ${dropBoxes} where ${dropBoxes.dropId} = ${drop.id} for update`);
    const avail = await availability(tx, drop.id, cart?.id ?? null);
    if (demoEnabled && input.flags?.demo === "soldout") {
      // Demo of the re-check alert: pretend most of the cookies and all the loaves went.
      for (const [slug, a] of avail) a.left = slug === "cookie-box" ? Math.min(a.left, 2) : slug === "banana-bread" ? 0 : a.left;
    }
    const { items, changes } = reconcile(input.items, avail);
    const left = Object.fromEntries([...avail].map(([slug, a]) => [slug, a.left]));
    if (Object.keys(items).length === 0 && changes.length === 0) return { ok: false as const, error: "empty" as const };
    if (changes.length) return { ok: true as const, checkoutId: null, revision: null, expiresAt: null, items, changes, left };

    let id: string;
    let revision: number;
    if (cart) {
      id = cart.id;
      revision = cart.revision + 1;
      await tx.update(carts).set({ items, revision, updatedAt: now }).where(eq(carts.id, id));
    } else {
      const [row] = await tx.insert(carts).values({ dropId: drop.id, items }).returning({ id: carts.id, revision: carts.revision });
      id = row.id;
      revision = row.revision;
    }
    const expiresAt = new Date(now.getTime() + holdMinutes * 60_000);
    await tx.delete(inventoryHolds).where(eq(inventoryHolds.cartId, id));
    await tx.insert(inventoryHolds).values(
      Object.entries(items).map(([slug, qty]) => ({ dropBoxId: avail.get(slug)!.dropBoxId, cartId: id, qty, expiresAt })),
    );
    return { ok: true as const, checkoutId: id, revision, expiresAt: expiresAt.getTime(), items, changes: [], left };
  });
}

// ---------------------------------------------------------------- held checkout

export interface HeldCheckout {
  checkoutId: string;
  dropSlug: string;
  items: Record<string, number>;
  revision: number;
  expiresAt: number;
}

/** The browser's cart if it still has unexpired holds, whether or not new checkouts are allowed (PRD 3.8). */
export async function heldCheckout(cartId: string | null): Promise<HeldCheckout | null> {
  if (!cartId || !UUID.test(cartId)) return null;
  const cart = await getDb().query.carts.findFirst({ where: eq(carts.id, cartId), with: { drop: true, holds: true } });
  if (!cart || cart.holds.length === 0) return null;
  const expiresAt = Math.min(...cart.holds.map((h) => h.expiresAt.getTime()));
  if (expiresAt <= Date.now()) return null;
  return { checkoutId: cart.id, dropSlug: cart.drop.slug, items: cart.items, revision: cart.revision, expiresAt };
}

// ---------------------------------------------------------------- place order

export interface PlaceInput {
  dropId: string;
  /** From startCheckout: the cart and the revision the customer reviewed. */
  checkoutId: string;
  revision: number;
  email: string;
  locale: Locale;
  delivery: DeliveryInput;
  gift: string | null;
  paymentMethod: "card" | "paypay";
}

export interface PlacedOrder {
  number: string;
  lines: { name: string; qty: number; lineTotal: number }[];
  subtotal: number;
  shippingFee: number;
  total: number;
  email: string;
}

export type PlaceResult =
  | { ok: true; order: PlacedOrder }
  | { ok: false; error: "hold_expired" | "invalid" | "changed" }
  | { ok: false; error: "limit"; box: string; name: string; max: number; already: number };

export async function placeOrder(input: PlaceInput, cartId: string | null): Promise<PlaceResult> {
  const email = input.email?.trim().toLowerCase() ?? "";
  const delivery = validateDelivery(input.delivery);
  const hit = delivery.hit;
  if (!EMAIL.test(email) || !delivery.ok || !hit || !Number.isInteger(input.revision)) return { ok: false, error: "invalid" };
  if (!cartId || !UUID.test(cartId)) return { ok: false, error: "hold_expired" };
  if (cartId !== input.checkoutId) return { ok: false, error: "changed" };
  const gift = input.gift?.trim().slice(0, 150) || null;
  const db = getDb();

  return db.transaction(async (tx) => {
    // The lock serialises concurrent submissions and startCheckout; a second submission finds the cart gone.
    const cart = await lockCart(tx, cartId);
    if (!cart) return { ok: false as const, error: "hold_expired" as const };
    if (cart.revision !== input.revision) return { ok: false as const, error: "changed" as const };
    const holds = await holdsOf(tx, cart.id);
    const drop = await tx.query.drops.findFirst({ where: eq(drops.id, cart.dropId) });
    const now = new Date();
    if (!drop || drop.slug !== input.dropId || holds.length === 0 || holds.some((h) => h.expiresAt <= now)) {
      return { ok: false as const, error: "hold_expired" as const };
    }

    // One order number per drop, in sequence: lock the drop while we pick the next one.
    await tx.execute(sql`select id from ${drops} where id = ${drop.id} for update`);

    // The account: found by email, or created unverified from the checkout until sign-in exists (PRD 2.2).
    // An existing customer's profile and saved address are never changed from an unverified checkout.
    const existing = await tx.query.customers.findFirst({ where: eq(customers.email, email), columns: { id: true } });
    let customerId = existing?.id;
    if (!customerId) {
      const [created] = await tx
        .insert(customers)
        .values({ email, name: input.delivery.name.trim(), phone: input.delivery.phone.trim(), locale: input.locale })
        .returning({ id: customers.id });
      customerId = created.id;
      await tx
        .insert(addresses)
        .values({
          customerId,
          postalCode: delivery.postal,
          prefecture: hit.prefecture,
          city: hit.city,
          town: hit.town,
          line1: input.delivery.line1.trim(),
          line2: input.delivery.line2?.trim() || null,
          wardCode: hit.wardCode,
        })
        .onConflictDoNothing();
    }

    // Per-customer limit across every order they already have in this drop (D7).
    const prior = await tx
      .select({ dropBoxId: orderItems.dropBoxId, qty: sql<number>`coalesce(sum(${orderItems.qty}), 0)::int` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.customerId, customerId), eq(orders.dropId, drop.id), notInArray(orders.state, ["cancelled", "expired"])))
      .groupBy(orderItems.dropBoxId);
    const already = new Map(prior.map((p) => [p.dropBoxId, p.qty]));
    for (const h of holds) {
      const had = already.get(h.dropBoxId) ?? 0;
      if (had + h.qty > h.dropBox.maxPerCustomer) {
        const name = (input.locale === "ja" && h.dropBox.box.nameJa) || h.dropBox.box.nameEn;
        return { ok: false as const, error: "limit" as const, box: h.dropBox.box.slug, name, max: h.dropBox.maxPerCustomer, already: had };
      }
    }

    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${orders.dropSequence}), 0) + 1` })
      .from(orders)
      .where(eq(orders.dropId, drop.id));
    const lines = holds.map((h) => ({
      dropBoxId: h.dropBoxId,
      boxId: h.dropBox.boxId,
      nameEn: h.dropBox.box.nameEn,
      nameJa: h.dropBox.box.nameJa,
      qty: h.qty,
      unitPrice: h.dropBox.price,
    }));
    const shippingFee = await setting(tx, "shipping_fee", defaultSettings.shippingFee ?? 0);
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const total = subtotal + shippingFee;
    const number = orderNumber(drop.number, next);
    const [order] = await tx
      .insert(orders)
      .values({
        number,
        checkoutId: cart.id,
        dropId: drop.id,
        dropSequence: next,
        customerId,
        locale: input.locale,
        shipToName: input.delivery.name.trim(),
        phone: input.delivery.phone.trim(),
        postalCode: delivery.postal,
        prefecture: hit.prefecture,
        city: hit.city,
        town: hit.town,
        line1: input.delivery.line1.trim(),
        line2: input.delivery.line2?.trim() || null,
        wardCode: hit.wardCode,
        giftMessage: gift,
        subtotal,
        shippingFee,
        total,
        paymentMethodType: input.paymentMethod,
      })
      .returning({ id: orders.id });
    await tx.insert(orderItems).values(lines.map((l) => ({ orderId: order.id, ...l })));
    await tx.update(inventoryHolds).set({ orderId: order.id }).where(eq(inventoryHolds.cartId, cart.id));

    // MOCK PAYMENT: no Stripe yet, so the order is paid the moment it's placed.
    // The payment PR moves this call into the webhook handler (PRD 3.5).
    await markPaid(tx, order.id, { note: "Mock payment: Stripe not wired yet" });
    await tx.delete(carts).where(eq(carts.id, cart.id));

    const name = (l: (typeof lines)[number]) => (input.locale === "ja" && l.nameJa) || l.nameEn;
    return {
      ok: true as const,
      order: { number, lines: lines.map((l) => ({ name: name(l), qty: l.qty, lineTotal: l.qty * l.unitPrice })), subtotal, shippingFee, total, email },
    };
  });
}

/**
 * Payment succeeded: stock is sold for real and the holds are released (D8).
 * Idempotent, so a webhook retry is harmless.
 */
export async function markPaid(tx: Conn, orderId: string, opts: { note?: string; paymentIntentId?: string } = {}) {
  const [order] = await tx.select({ state: orders.state }).from(orders).where(eq(orders.id, orderId));
  if (!order || order.state !== "pending_payment") return;
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const it of items) {
    const [box] = await tx.select({ cap: dropBoxes.cap, sold: dropBoxes.soldQty }).from(dropBoxes).where(eq(dropBoxes.id, it.dropBoxId)).for("update");
    if (!box || box.sold + it.qty > box.cap) throw new Error(`Oversold drop box ${it.dropBoxId}`);
    await tx.update(dropBoxes).set({ soldQty: box.sold + it.qty }).where(eq(dropBoxes.id, it.dropBoxId));
  }
  await tx.delete(inventoryHolds).where(eq(inventoryHolds.orderId, orderId));
  const now = new Date();
  await tx
    .update(orders)
    .set({ state: "paid", paidAt: now, updatedAt: now, notes: opts.note, stripePaymentIntentId: opts.paymentIntentId })
    .where(eq(orders.id, orderId));
}
