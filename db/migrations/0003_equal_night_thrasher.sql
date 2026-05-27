CREATE TABLE "ai_account_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"brand_voice" text,
	"audiences" text,
	"products" text,
	"learnings" text,
	"constraints" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_account_memory_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "ai_account_memory" ADD CONSTRAINT "ai_account_memory_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;