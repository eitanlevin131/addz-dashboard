BEGIN;

SET LOCAL lock_timeout='5s';

SET LOCAL statement_timeout='60s';

DO $$ BEGIN IF current_database()<>'neondb' OR to_regclass('public.client_contacts') IS NULL THEN RAISE EXCEPTION 'Missing baseline'; END IF; IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename IN ('website_scans','website_scan_sources','website_findings','ai_runs')) THEN RAISE EXCEPTION 'Epic 2 already exists'; END IF; END $$;

CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"task" text NOT NULL,
	"attempt" integer NOT NULL,
	"model" text NOT NULL,
	"skill_name" text NOT NULL,
	"skill_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"output" jsonb,
	"status" text NOT NULL,
	"error_code" text,
	"duration_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"provider_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_scan_id_idx" UNIQUE("scan_id","id")
);

CREATE TABLE "website_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"ai_run_id" uuid,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"evidence" text NOT NULL,
	"locator" text,
	"source_type" text NOT NULL,
	"observation_status" text NOT NULL,
	"confidence" text NOT NULL,
	"finding_hash" text NOT NULL,
	"review_disposition" text DEFAULT 'normal' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_findings_observation_check" CHECK ("website_findings"."observation_status" in ('observed','inferred')),
	CONSTRAINT "website_findings_review_check" CHECK ("website_findings"."review_disposition" in ('normal','needs_review','ignored')),
	CONSTRAINT "website_findings_confidence_check" CHECK ("website_findings"."confidence" in ('high','medium','low'))
);

CREATE TABLE "website_scan_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"url_hash" text NOT NULL,
	"page_type" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"title" text,
	"language" text,
	"text" text,
	"content_hash" text,
	"extracted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"http_status" integer,
	"bytes" integer,
	"error_code" text,
	"fetched_at" timestamp with time zone,
	CONSTRAINT "website_scan_sources_scan_id_idx" UNIQUE("scan_id","id")
);

CREATE TABLE "website_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"requested_by" text,
	"previous_scan_id" uuid,
	"website_url" text NOT NULL,
	"final_url" text,
	"version" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"state" jsonb NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"step_attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"next_request_at" timestamp with time zone,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_scans_client_id_idx" UNIQUE("client_id","id"),
	CONSTRAINT "website_scans_status_check" CHECK ("website_scans"."status" in ('pending','running','processing','completed','completed_with_warnings','failed','cancelled'))
);

ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_scan_client_fk" FOREIGN KEY ("client_id","scan_id") REFERENCES "public"."website_scans"("client_id","id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "website_findings" ADD CONSTRAINT "website_findings_scan_id_website_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."website_scans"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "website_findings" ADD CONSTRAINT "website_findings_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "website_findings" ADD CONSTRAINT "website_findings_source_fk" FOREIGN KEY ("scan_id","source_id") REFERENCES "public"."website_scan_sources"("scan_id","id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "website_findings" ADD CONSTRAINT "website_findings_ai_run_fk" FOREIGN KEY ("scan_id","ai_run_id") REFERENCES "public"."ai_runs"("scan_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "website_scan_sources" ADD CONSTRAINT "website_scan_sources_scan_id_website_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."website_scans"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "website_scans" ADD CONSTRAINT "website_scans_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "website_scans" ADD CONSTRAINT "website_scans_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "website_scans" ADD CONSTRAINT "website_scans_previous_fk" FOREIGN KEY ("client_id","previous_scan_id") REFERENCES "public"."website_scans"("client_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX "ai_runs_task_attempt_idx" ON "ai_runs" USING btree ("scan_id","task","attempt");

CREATE INDEX "website_findings_category_idx" ON "website_findings" USING btree ("scan_id","category");

CREATE UNIQUE INDEX "website_findings_hash_idx" ON "website_findings" USING btree ("scan_id","finding_hash");

CREATE UNIQUE INDEX "website_scan_sources_url_idx" ON "website_scan_sources" USING btree ("scan_id","url_hash");

CREATE INDEX "website_scan_sources_status_idx" ON "website_scan_sources" USING btree ("scan_id","status");

CREATE INDEX "website_scans_client_time_idx" ON "website_scans" USING btree ("client_id","created_at");

CREATE UNIQUE INDEX "website_scans_active_client_idx" ON "website_scans" USING btree ("client_id") WHERE "website_scans"."status" in ('pending','running','processing');

DO $$ BEGIN IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('website_scans','website_scan_sources','website_findings','ai_runs'))<>76 THEN RAISE EXCEPTION 'Missing columns'; END IF; IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('website_scans_previous_fk','website_findings_ai_run_fk') AND condeferrable AND condeferred)<>2 THEN RAISE EXCEPTION 'Missing deferred constraints'; END IF; END $$;

COMMIT;
