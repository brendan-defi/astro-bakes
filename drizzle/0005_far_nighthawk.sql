CREATE TABLE "custom_order_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"event_date" date NOT NULL,
	"party_size" text NOT NULL,
	"occasion" text,
	"details" text NOT NULL,
	"customer_id" uuid,
	"ip_hash" text,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_order_requests" ADD CONSTRAINT "custom_order_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_order_requests_email_idx" ON "custom_order_requests" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "custom_order_requests_ip_idx" ON "custom_order_requests" USING btree ("ip_hash","created_at");