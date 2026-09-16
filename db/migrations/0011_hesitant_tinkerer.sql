CREATE TABLE "site_revenue_benchmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flashy_account_id" uuid NOT NULL,
	"range_start" date NOT NULL,
	"range_end" date NOT NULL,
	"revenue" numeric(16, 2) NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_revenue_benchmarks_flashy_account_id_range_start_range_end_unique" UNIQUE("flashy_account_id","range_start","range_end")
);
--> statement-breakpoint
ALTER TABLE "site_revenue_benchmarks" ADD CONSTRAINT "site_revenue_benchmarks_flashy_account_id_flashy_accounts_id_fk" FOREIGN KEY ("flashy_account_id") REFERENCES "public"."flashy_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_revenue_benchmarks" ADD CONSTRAINT "site_revenue_benchmarks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;