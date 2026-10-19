import { relations, sql } from "drizzle-orm";
import {
  boolean,
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
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_email_idx").on(t.email)],
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

/** The catalogue (PRD 4.3). Prices are tax-inclusive JPY (D18); null until the owner sets one. */
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
  price: integer(),
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
    price: integer(),
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

// ---------------------------------------------------------------- Relations

export const customersRelations = relations(customers, ({ one }) => ({
  address: one(addresses, { fields: [customers.id], references: [addresses.customerId] }),
}));
export const addressesRelations = relations(addresses, ({ one }) => ({
  customer: one(customers, { fields: [addresses.customerId], references: [customers.id] }),
}));
export const dropsRelations = relations(drops, ({ many }) => ({ dropBoxes: many(dropBoxes) }));
export const dropBoxesRelations = relations(dropBoxes, ({ one }) => ({
  drop: one(drops, { fields: [dropBoxes.dropId], references: [drops.id] }),
  box: one(boxes, { fields: [dropBoxes.boxId], references: [boxes.id] }),
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
