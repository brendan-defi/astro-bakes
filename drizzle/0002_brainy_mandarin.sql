CREATE TYPE "public"."order_state" AS ENUM('pending_payment', 'paid', 'packed', 'shipped', 'complete', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'paypay');--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"customer_id" uuid,
	"items" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_box_id" uuid NOT NULL,
	"cart_id" uuid,
	"order_id" uuid,
	"qty" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"drop_box_id" uuid NOT NULL,
	"box_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_ja" text,
	"qty" integer NOT NULL,
	"unit_price" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"checkout_id" uuid NOT NULL,
	"drop_id" uuid NOT NULL,
	"drop_sequence" integer NOT NULL,
	"customer_id" uuid NOT NULL,
	"state" "order_state" DEFAULT 'pending_payment' NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"ship_to_name" text NOT NULL,
	"phone" text NOT NULL,
	"postal_code" text NOT NULL,
	"prefecture" text NOT NULL,
	"city" text NOT NULL,
	"town" text,
	"line1" text NOT NULL,
	"line2" text,
	"ward_code" text,
	"gift_message" text,
	"subtotal" integer NOT NULL,
	"shipping_fee" integer NOT NULL,
	"total" integer NOT NULL,
	"stripe_payment_intent_id" text,
	"payment_method_type" "payment_method",
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"packed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"tracking_number" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_checkoutId_unique" UNIQUE("checkout_id"),
	CONSTRAINT "orders_stripePaymentIntentId_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_drop_box_id_drop_boxes_id_fk" FOREIGN KEY ("drop_box_id") REFERENCES "public"."drop_boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_drop_box_id_drop_boxes_id_fk" FOREIGN KEY ("drop_box_id") REFERENCES "public"."drop_boxes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_holds_drop_box_idx" ON "inventory_holds" USING btree ("drop_box_id","expires_at");--> statement-breakpoint
CREATE INDEX "inventory_holds_cart_idx" ON "inventory_holds" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_drop_sequence_idx" ON "orders" USING btree ("drop_id","drop_sequence");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_drop_state_idx" ON "orders" USING btree ("drop_id","state");