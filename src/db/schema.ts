import { relations, sql } from "drizzle-orm";
import { DELIVERY_SLOTS } from "../lib/delivery-slots";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database schema for PRD 5.1 (users and drops; orders come with the checkout
 * wiring). Column names are snake_case via Drizzle's `casing` option. Times are
 * timestamptz (UTC) and rendered in JST. Customer-facing text has `_en` / `_ja`
 * columns (D2); `_ja` stays null until the Japanese copy exists and the app
 * falls back to English.
 */

export const localeEnum = pgEnum("locale", ["en", "ja"]);
export const customerRoleEnum = pgEnum("customer_role", ["customer", "admin"]);
/** Drop lifecycle (PRD 5.2a). */
export const dropStateEnum = pgEnum("drop_state", [
  "draft",
  "scheduled",
  "open",
  "closed",
  "baking",
  "shipped",
  "complete",
  "cancelled",
]);

/** Order lifecycle (PRD 5.2b). */
export const orderStateEnum = pgEnum("order_state", [
  "pending_payment",
  "paid",
  "packed",
  "shipped",
  "complete",
  "expired",
  "cancelled",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["card", "paypay"]);
/** The customer's delivery time slot (D21); the date is fixed by the drop. */
export const deliverySlotEnum = pgEnum("delivery_time_slot", DELIVERY_SLOTS);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------- Users

/** An account (D12). Email is the identity; sign-in is magic link + code (D13). Stored lowercased. */
export const customers = pgTable("customers", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  emailVerifiedAt: timestamp({ withTimezone: true }),
  /** One free-text name, kanji or romaji (D15). */
  name: text(),
  phone: text(),
  locale: localeEnum().notNull().default("en"),
  /** "Email me when a drop is announced or opens" (PRD 2.4). Default on, with consent text shown. */
  marketingOptIn: boolean().notNull().default(true),
  role: customerRoleEnum().notNull().default("customer"),
  ...timestamps,
  deletedAt: timestamp({ withTimezone: true }),
});

/** Saved delivery address, one per customer in v1 (PRD 2.3). Orders snapshot it. */
export const addresses = pgTable("addresses", {
  id: uuid().primaryKey().defaultRandom(),
  customerId: uuid()
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" })
    .unique(),
  /** 7 digits, no hyphen. */
  postalCode: text().notNull(),
  prefecture: text().notNull(),
  /** Ward or city, e.g. 目黒区. */
  city: text().notNull(),
  /** Town from the postal lookup, e.g. 中目黒. */
  town: text(),
  line1: text().notNull(),
  line2: text(),
  /** JIS code from the lookup (Meguro = 13110); the 23-ward check runs on this (D20). */
  wardCode: text(),
  ...timestamps,
});

/** Notify-me list; no account required (D12, PRD 1.5). */
export const subscribers = pgTable("subscribers", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  locale: localeEnum().notNull().default("en"),
  /** Where the signup came from: homepage, checkout, account, admin. */
  source: text().notNull().default("homepage"),
  consentedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  unsubscribedAt: timestamp({ withTimezone: true }),
  /** Set when the subscriber later creates an account (PRD 2.7). */
  convertedCustomerId: uuid().references(() => customers.id, { onDelete: "set null" }),
  ...timestamps,
});

/** Magic link + 6-digit code with a 15-minute expiry (D13, PRD 2.1). Only hashes are stored. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    tokenHash: text().notNull().unique(),
    codeHash: text().notNull(),
    /** Wrong-code attempts; the token locks after a few (PRD 5.4). */
    attempts: integer().notNull().default(0),
    locale: localeEnum().notNull().default("en"),
    /** Same-site path to return to after sign-in (checkout step 2, the account page). */
    next: text(),
    /** Hash of the requesting IP, for the per-IP rate limit (PRD 5.4). */
    ipHash: text(),
    /** Hash of the browser's flow cookie: only that browser may redeem silently; others must confirm. */
    flowHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_email_idx").on(t.email, t.createdAt), index("auth_tokens_ip_idx").on(t.ipHash, t.createdAt)],
);

/** A signed-in browser: a random token in a 90-day httpOnly cookie, hashed here, so sign-out and revocation are real (PRD 2.1). */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_customer_idx").on(t.customerId)],
);

/** Money owed or returned to a customer (PRD 5.1, D22). issued_at is null until Stripe confirms the refund. */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    amount: integer().notNull(),
    /** customer_cancelled, admin_cancelled, damage, non_delivery … */
    reason: text().notNull(),
    stripeRefundId: text().unique(),
    issuedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refunds_order_idx").on(t.orderId)],
);

/** Every email we send (PRD 5.1, 5.3): what, to whom, when, and the provider's id or the error. */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** sign_in, order_confirmation, order_cancelled, shipped, announcement, internal … */
    type: text().notNull(),
    to: text().notNull(),
    customerId: uuid().references(() => customers.id, { onDelete: "set null" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    providerMessageId: text(),
    error: text(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notification_log_to_idx").on(t.to, t.sentAt)],
);

// ---------------------------------------------------------------- Drops

/** A drop (PRD 5.2a, D10). Arrival is ship_at + 1 day and is not stored (D21). */
export const drops = pgTable(
  "drops",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Sequence number: "Drop 03"; order numbers are AB-003-017. */
    number: integer().notNull().unique(),
    slug: text().notNull().unique(),
    nameEn: text().notNull(),
    nameJa: text(),
    descriptionEn: text(),
    descriptionJa: text(),
    state: dropStateEnum().notNull().default("draft"),
    openAt: timestamp({ withTimezone: true }).notNull(),
    closeAt: timestamp({ withTimezone: true }).notNull(),
    /** Internal: when the bake happens; drives the production sheet (PRD 4.5). */
    bakeAt: timestamp({ withTimezone: true }),
    shipAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("drops_state_idx").on(t.state), index("drops_open_at_idx").on(t.openAt)],
);

/** The catalogue (PRD 4.3). Prices are tax-inclusive JPY (D18). */
export const boxes = pgTable("boxes", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  nameEn: text().notNull(),
  nameJa: text(),
  descriptionEn: text(),
  descriptionJa: text(),
  /** Display line for what's inside ("1 slice … · 2 cookies"). box_items holds the production breakdown. */
  contentsEn: text(),
  contentsJa: text(),
  price: integer().notNull(),
  allergens: text().array().notNull().default(sql`'{}'::text[]`),
  /** Photo URLs (Vercel Blob later; placeholders render until then, D4). */
  photos: text().array().notNull().default(sql`'{}'::text[]`),
  active: boolean().notNull().default(true),
  /** Defaults copied onto drop_boxes when a drop is scheduled (D5, D7). */
  defaultCap: integer().notNull().default(20),
  defaultMaxPerCustomer: integer().notNull().default(5),
  sort: integer().notNull().default(0),
  ...timestamps,
});

/** Something the kitchen bakes; boxes are made of items (PRD 4.3, 4.5). */
export const items = pgTable("items", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  nameEn: text().notNull(),
  nameJa: text(),
  /** What the kitchen counts in: "cookie", "mini loaf", "cake". */
  productionUnit: text().notNull(),
  /** Sold units per production unit, e.g. 12 slices per cake. */
  unitsPerProductionUnit: integer().notNull().default(1),
  /** Extra fraction to bake for breakage, e.g. 0.10. */
  bakeBuffer: numeric({ precision: 4, scale: 2 }).notNull().default("0"),
  ...timestamps,
});

export const boxItems = pgTable(
  "box_items",
  {
    boxId: uuid()
      .notNull()
      .references(() => boxes.id, { onDelete: "cascade" }),
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    qty: integer().notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.boxId, t.itemId] })],
);

/** A box offered in a drop, with its cap and price snapshot (D5, D7). remaining = cap − sold − active holds (D8). */
export const dropBoxes = pgTable(
  "drop_boxes",
  {
    id: uuid().primaryKey().defaultRandom(),
    dropId: uuid()
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    boxId: uuid()
      .notNull()
      .references(() => boxes.id, { onDelete: "restrict" }),
    cap: integer().notNull(),
    maxPerCustomer: integer().notNull().default(5),
    /** Price snapshot taken when the box is added to the drop (D18). */
    price: integer().notNull(),
    soldQty: integer().notNull().default(0),
    sort: integer().notNull().default(0),
  },
  (t) => [uniqueIndex("drop_boxes_drop_box_idx").on(t.dropId, t.boxId)],
);

/** Admin settings (PRD 4.9): shipping_fee, shipping_area, instagram_url, line_url, contact_email, hold_minutes. */
export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- Checkout and orders

/** A checkout in progress, identified by an httpOnly cookie. Holds the cart as the browser sent it (PRD 3.3). */
export const carts = pgTable("carts", {
  id: uuid().primaryKey().defaultRandom(),
  dropId: uuid()
    .notNull()
    .references(() => drops.id, { onDelete: "cascade" }),
  customerId: uuid().references(() => customers.id, { onDelete: "set null" }),
  /** { [boxSlug]: qty } */
  items: jsonb().$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
  /** Bumped every time the holds are replaced; an order submission must quote the revision it was shown. */
  revision: integer().notNull().default(1),
  ...timestamps,
});

/**
 * A reservation taken when checkout starts (D8). Active while expires_at is in
 * the future; consumed on payment, ignored once expired. remaining = cap − sold − active holds.
 */
export const inventoryHolds = pgTable(
  "inventory_holds",
  {
    id: uuid().primaryKey().defaultRandom(),
    dropBoxId: uuid()
      .notNull()
      .references(() => dropBoxes.id, { onDelete: "cascade" }),
    cartId: uuid().references(() => carts.id, { onDelete: "cascade" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    qty: integer().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inventory_holds_drop_box_idx").on(t.dropBoxId, t.expiresAt), index("inventory_holds_cart_idx").on(t.cartId)],
);

/** An order (PRD 5.1, 5.2b). Delivery details are a snapshot taken at checkout (D20, D21); money is tax-inclusive JPY (D18). */
export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Human-readable: AB-003-017 = drop 3, 17th order. */
    number: text().notNull().unique(),
    /** The cart this order was placed from; unique, so one checkout can never produce two orders. */
    checkoutId: uuid().notNull().unique(),
    dropId: uuid()
      .notNull()
      .references(() => drops.id, { onDelete: "restrict" }),
    dropSequence: integer().notNull(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    state: orderStateEnum().notNull().default("pending_payment"),
    locale: localeEnum().notNull().default("en"),
    shipToName: text().notNull(),
    phone: text().notNull(),
    postalCode: text().notNull(),
    prefecture: text().notNull(),
    city: text().notNull(),
    town: text(),
    line1: text().notNull(),
    line2: text(),
    wardCode: text(),
    /** One optional message per order, handwritten on a card (D11). */
    giftMessage: text(),
    /** Delivery time slot (D21); "none" is Japan Post's 希望なし. Changeable until the drop closes. */
    deliveryTimeSlot: deliverySlotEnum().notNull().default("none"),
    subtotal: integer().notNull(),
    shippingFee: integer().notNull(),
    total: integer().notNull(),
    stripePaymentIntentId: text().unique(),
    paymentMethodType: paymentMethodEnum(),
    paidAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    packedAt: timestamp({ withTimezone: true }),
    shippedAt: timestamp({ withTimezone: true }),
    trackingNumber: text(),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_drop_sequence_idx").on(t.dropId, t.dropSequence),
    index("orders_customer_idx").on(t.customerId),
    index("orders_drop_state_idx").on(t.dropId, t.state),
  ],
);

/** A line on an order, with the box name and price as they were at the time. */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    dropBoxId: uuid()
      .notNull()
      .references(() => dropBoxes.id, { onDelete: "restrict" }),
    boxId: uuid()
      .notNull()
      .references(() => boxes.id, { onDelete: "restrict" }),
    nameEn: text().notNull(),
    nameJa: text(),
    qty: integer().notNull(),
    unitPrice: integer().notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

// ---------------------------------------------------------------- Custom orders

/**
 * "Want cookies at your next party?" requests from /custom-orders. Nothing is
 * booked or charged; the owner replies to the customer by email. Only the
 * sender's IP hash is kept, for the rate limit (custom-order-rules.ts).
 */
export const customOrderRequests = pgTable(
  "custom_order_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull(),
    /** The language they wrote in, so the reply can match it. */
    locale: localeEnum().notNull().default("en"),
    /** The Tokyo calendar day of the party. */
    eventDate: date({ mode: "string" }).notNull(),
    /** upTo20 · 20to50 · 50to100 · over100 */
    partySize: text().notNull(),
    /** unsealed (party-ready, on parchment in catering boxes) · sealed (each cookie heat-sealed and labelled) */
    packaging: text().notNull(),
    /** birthday · office · wedding · other; null when they didn't say. */
    occasion: text(),
    details: text().notNull(),
    /** Set when they were signed in. */
    customerId: uuid().references(() => customers.id, { onDelete: "set null" }),
    ipHash: text(),
    /** When the owner's notification went out; null if the send failed (the error is in notification_log). */
    notifiedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_order_requests_email_idx").on(t.email, t.createdAt), index("custom_order_requests_ip_idx").on(t.ipHash, t.createdAt)],
);

// ---------------------------------------------------------------- Relations

export const customersRelations = relations(customers, ({ one, many }) => ({
  address: one(addresses, { fields: [customers.id], references: [addresses.customerId] }),
  orders: many(orders),
  sessions: many(sessions),
}));
export const sessionsRelations = relations(sessions, ({ one }) => ({
  customer: one(customers, { fields: [sessions.customerId], references: [customers.id] }),
}));
export const addressesRelations = relations(addresses, ({ one }) => ({
  customer: one(customers, { fields: [addresses.customerId], references: [customers.id] }),
}));
export const dropsRelations = relations(drops, ({ many }) => ({ dropBoxes: many(dropBoxes), orders: many(orders) }));
export const dropBoxesRelations = relations(dropBoxes, ({ one, many }) => ({
  drop: one(drops, { fields: [dropBoxes.dropId], references: [drops.id] }),
  box: one(boxes, { fields: [dropBoxes.boxId], references: [boxes.id] }),
  holds: many(inventoryHolds),
}));
export const cartsRelations = relations(carts, ({ one, many }) => ({
  drop: one(drops, { fields: [carts.dropId], references: [drops.id] }),
  holds: many(inventoryHolds),
}));
export const inventoryHoldsRelations = relations(inventoryHolds, ({ one }) => ({
  dropBox: one(dropBoxes, { fields: [inventoryHolds.dropBoxId], references: [dropBoxes.id] }),
  cart: one(carts, { fields: [inventoryHolds.cartId], references: [carts.id] }),
  order: one(orders, { fields: [inventoryHolds.orderId], references: [orders.id] }),
}));
export const ordersRelations = relations(orders, ({ one, many }) => ({
  drop: one(drops, { fields: [orders.dropId], references: [drops.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
  refunds: many(refunds),
}));
export const refundsRelations = relations(refunds, ({ one }) => ({
  order: one(orders, { fields: [refunds.orderId], references: [orders.id] }),
}));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  dropBox: one(dropBoxes, { fields: [orderItems.dropBoxId], references: [dropBoxes.id] }),
  box: one(boxes, { fields: [orderItems.boxId], references: [boxes.id] }),
}));
export const boxesRelations = relations(boxes, ({ many }) => ({ dropBoxes: many(dropBoxes), boxItems: many(boxItems) }));
export const boxItemsRelations = relations(boxItems, ({ one }) => ({
  box: one(boxes, { fields: [boxItems.boxId], references: [boxes.id] }),
  item: one(items, { fields: [boxItems.itemId], references: [items.id] }),
}));

// ---------------------------------------------------------------- Row types

export type CustomerRow = typeof customers.$inferSelect;
export type AddressRow = typeof addresses.$inferSelect;
export type SubscriberRow = typeof subscribers.$inferSelect;
export type DropRow = typeof drops.$inferSelect;
export type BoxRow = typeof boxes.$inferSelect;
export type DropBoxRow = typeof dropBoxes.$inferSelect;
export type AuthTokenRow = typeof authTokens.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type CartRow = typeof carts.$inferSelect;
export type InventoryHoldRow = typeof inventoryHolds.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type RefundRow = typeof refunds.$inferSelect;
export type CustomOrderRequestRow = typeof customOrderRequests.$inferSelect;
