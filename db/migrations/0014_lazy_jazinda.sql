CREATE TABLE "newsletter_plan_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"newsletter_plan_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"url" text,
	"blob_pathname" text,
	"file_name" text,
	"mime_type" text,
	"size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_plan_campaign_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"newsletter_plan_id" uuid NOT NULL,
	"flashy_account_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"campaign_id" integer,
	"method" text,
	"confidence" numeric(5, 4),
	"matched_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"matching_disabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_plan_campaign_matches_newsletter_plan_id_channel_unique" UNIQUE("newsletter_plan_id","channel"),
	CONSTRAINT "newsletter_plan_campaign_matches_flashy_account_id_channel_campaign_id_unique" UNIQUE("flashy_account_id","channel","campaign_id")
);
--> statement-breakpoint
ALTER TABLE "newsletter_plans" ALTER COLUMN "planned_date" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "brief" text;
--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "audience" text;
--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "offer" text;
--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "cta" text;
--> statement-breakpoint
ALTER TABLE "newsletter_plans" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "newsletter_plans" SET "brief" = COALESCE("notes", '') WHERE "brief" IS NULL;
--> statement-breakpoint
INSERT INTO "newsletter_plan_campaign_matches" (
	"newsletter_plan_id", "flashy_account_id", "channel", "campaign_id", "method", "confidence",
	"matched_at", "confirmed_at", "matching_disabled"
)
SELECT
	"id", "flashy_account_id", COALESCE("matched_campaign_channel", "channel"), "matched_campaign_id",
	"match_method", "match_confidence", "matched_at", "match_confirmed_at", "matching_disabled"
FROM "newsletter_plans"
WHERE "flashy_account_id" IS NOT NULL
	AND ("matched_campaign_id" IS NOT NULL OR "matching_disabled" = true)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "newsletter_plan_assets" ADD CONSTRAINT "newsletter_plan_assets_newsletter_plan_id_newsletter_plans_id_fk" FOREIGN KEY ("newsletter_plan_id") REFERENCES "public"."newsletter_plans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "newsletter_plan_campaign_matches" ADD CONSTRAINT "newsletter_plan_campaign_matches_newsletter_plan_id_newsletter_plans_id_fk" FOREIGN KEY ("newsletter_plan_id") REFERENCES "public"."newsletter_plans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "newsletter_plan_campaign_matches" ADD CONSTRAINT "newsletter_plan_campaign_matches_flashy_account_id_flashy_accounts_id_fk" FOREIGN KEY ("flashy_account_id") REFERENCES "public"."flashy_accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "newsletter_plan_assets_plan_idx" ON "newsletter_plan_assets" USING btree ("newsletter_plan_id");
--> statement-breakpoint
CREATE INDEX "newsletter_plan_matches_plan_idx" ON "newsletter_plan_campaign_matches" USING btree ("newsletter_plan_id");
