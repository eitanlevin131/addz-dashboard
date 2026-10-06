CREATE TABLE "client_questionnaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"created_by" text,
	"snapshot" jsonb NOT NULL,
	"selected_ids" jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"token_hash" text,
	"link_expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"shared_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_questionnaires_status_check" CHECK ("client_questionnaires"."status" in ('draft','ready','sent','in_progress','submitted','reviewed')),
	CONSTRAINT "client_questionnaires_revision_check" CHECK ("client_questionnaires"."revision" >= 0),
	CONSTRAINT "client_questionnaires_json_check" CHECK (jsonb_typeof("client_questionnaires"."snapshot") = 'object' and jsonb_typeof("client_questionnaires"."answers") = 'object' and jsonb_typeof("client_questionnaires"."selected_ids") = 'array'),
	CONSTRAINT "client_questionnaires_token_check" CHECK ("client_questionnaires"."token_hash" is null or ("client_questionnaires"."token_hash" ~ '^[a-f0-9]{64}$' and "client_questionnaires"."link_expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "questionnaire_rate_limits" (
	"bucket" text PRIMARY KEY NOT NULL,
	"requests" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_questionnaires" ADD CONSTRAINT "client_questionnaires_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_questionnaires" ADD CONSTRAINT "client_questionnaires_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_questionnaires_client_idx" ON "client_questionnaires" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_questionnaires_token_idx" ON "client_questionnaires" USING btree ("token_hash") WHERE "client_questionnaires"."token_hash" is not null;--> statement-breakpoint
CREATE INDEX "questionnaire_rate_limits_expiry_idx" ON "questionnaire_rate_limits" USING btree ("expires_at");