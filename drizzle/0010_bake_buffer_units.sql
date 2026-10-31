-- The bake buffer becomes whole production units ("+1 cake", PRD 4.5) instead of a fraction. Nothing ever set the
-- fraction (the item editor had no field for it), so every value is 0; any that isn't becomes one spare unit.
ALTER TABLE "items" ALTER COLUMN "bake_buffer" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "bake_buffer" SET DATA TYPE integer USING ceil("bake_buffer")::integer;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "bake_buffer" SET DEFAULT 0;
