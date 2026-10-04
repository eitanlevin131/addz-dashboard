CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"job_title" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_type" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "package_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "monthly_retainer_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "included_services" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "onboarding_stage" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_contacts_primary_idx" ON "client_contacts" USING btree ("client_id") WHERE "client_contacts"."is_primary" = true;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_client_time_idx" ON "audit_logs" USING btree ("client_id","created_at");