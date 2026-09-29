ALTER TABLE "newsletter_plans" ADD COLUMN IF NOT EXISTS "objective" text;--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN IF NOT EXISTS "learning" text;--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN IF NOT EXISTS "learning_updated_at" timestamp with time zone;
