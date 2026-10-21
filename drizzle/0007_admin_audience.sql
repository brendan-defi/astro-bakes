CREATE TYPE "public"."auth_audience" AS ENUM('customer', 'admin');--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN "audience" "auth_audience" DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "audience" "auth_audience" DEFAULT 'customer' NOT NULL;