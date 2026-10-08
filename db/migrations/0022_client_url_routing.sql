ALTER TABLE "clients" ADD COLUMN "url_slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_url_slug_unique" ON "clients" USING btree ("url_slug");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_url_slug_format" CHECK ("clients"."url_slug" IS NULL OR ("clients"."url_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("clients"."url_slug") <= 80));