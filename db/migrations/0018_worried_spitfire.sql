ALTER TABLE "clients" ADD COLUMN "package_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "commercial_scope" jsonb;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "one_time_amount" numeric(12, 2);