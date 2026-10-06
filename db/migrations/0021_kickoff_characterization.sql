CREATE TABLE "client_characterizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"questionnaire_id" uuid,
	"created_by" text,
	"snapshot" jsonb NOT NULL,
	"added_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_characterizations_status_check" CHECK ("client_characterizations"."status" in ('in_progress','completed')),
	CONSTRAINT "client_characterizations_revision_check" CHECK ("client_characterizations"."revision" >= 0),
	CONSTRAINT "client_characterizations_json_check" CHECK (jsonb_typeof("client_characterizations"."snapshot") = 'object' and jsonb_typeof("client_characterizations"."added_topics") = 'array' and jsonb_typeof("client_characterizations"."decisions") = 'object'),
	CONSTRAINT "client_characterizations_completion_check" CHECK (("client_characterizations"."status" = 'completed') = ("client_characterizations"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "client_characterizations" ADD CONSTRAINT "client_characterizations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_characterizations" ADD CONSTRAINT "client_characterizations_questionnaire_id_client_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."client_questionnaires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_characterizations" ADD CONSTRAINT "client_characterizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_characterizations_client_idx" ON "client_characterizations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_characterizations_questionnaire_idx" ON "client_characterizations" USING btree ("questionnaire_id");