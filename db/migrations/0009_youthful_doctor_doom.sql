ALTER TABLE "newsletter_plans" ADD COLUMN "matched_campaign_id" integer;--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "matched_campaign_channel" text;--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "match_method" text;--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "match_confidence" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "matched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "match_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "matching_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD CONSTRAINT "newsletter_plans_flashy_account_id_matched_campaign_channel_matched_campaign_id_unique" UNIQUE("flashy_account_id","matched_campaign_channel","matched_campaign_id");