CREATE TABLE "ai_content_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"flashy_account_id" uuid NOT NULL,
	"created_by_user_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"preheader" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_content_drafts" ADD CONSTRAINT "ai_content_drafts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_drafts" ADD CONSTRAINT "ai_content_drafts_flashy_account_id_flashy_accounts_id_fk" FOREIGN KEY ("flashy_account_id") REFERENCES "public"."flashy_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_drafts" ADD CONSTRAINT "ai_content_drafts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_content_drafts_account_updated_idx" ON "ai_content_drafts" USING btree ("flashy_account_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_content_drafts_client_status_idx" ON "ai_content_drafts" USING btree ("client_id","status");