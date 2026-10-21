CREATE TABLE "signup_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "consent_ip_hash" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "welcome_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "welcome_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "welcome_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "welcome_next_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "signup_attempts_ip_idx" ON "signup_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "signup_attempts_created_idx" ON "signup_attempts" USING btree ("created_at");