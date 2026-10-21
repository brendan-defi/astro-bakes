ALTER TABLE "subscribers" ADD COLUMN "consent_ip_hash" text;--> statement-breakpoint
CREATE INDEX "subscribers_consent_ip_idx" ON "subscribers" USING btree ("consent_ip_hash","consented_at");