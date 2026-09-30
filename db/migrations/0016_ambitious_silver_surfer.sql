CREATE TABLE "account_change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"flashy_account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"details" text NOT NULL,
	"reason" text,
	"areas" text[] DEFAULT '{}' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_change_events" ADD CONSTRAINT "account_change_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_change_events" ADD CONSTRAINT "account_change_events_flashy_account_id_flashy_accounts_id_fk" FOREIGN KEY ("flashy_account_id") REFERENCES "public"."flashy_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_change_events" ADD CONSTRAINT "account_change_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_change_events_account_occurred_idx" ON "account_change_events" USING btree ("flashy_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "account_change_events_client_occurred_idx" ON "account_change_events" USING btree ("client_id","occurred_at");