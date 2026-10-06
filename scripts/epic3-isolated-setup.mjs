import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";

// Only the already provisioned synthetic Epic 2 branch may be touched.
// No .env loading, Production query, host substitution or credential printing.
const config = JSON.parse(fs.readFileSync(".tmp/epic2/environment.json", "utf8"));
const target = new URL(config.E2E_DATABASE_URL);
const host = "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech";
if (process.env.VERCEL || target.hostname !== host || target.pathname !== "/addz_epic2_validation") throw Error("Unsafe isolated setup target");
const statements = fs.readFileSync("db/migrations/0020_smart_questionnaire.sql", "utf8").split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
const isolated = neon(target.href);
async function inspect(db) {
  const tables = await db.query("select tablename from pg_tables where schemaname='public' and tablename not in ('client_questionnaires','questionnaire_rate_limits') order by tablename");
  const markers = {};
  for (const { tablename } of tables) {
    if (!/^[a-z_]+$/.test(tablename)) throw Error("Unsafe table name");
    markers[tablename] = (await db.query(`select count(*)::int as count,md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) as hash from "${tablename}" t`))[0];
  }
  return markers;
}
async function migrate(db, database) {
  const before = await inspect(db);
  await db.transaction([
    db.query("set local lock_timeout='5s'"), db.query("set local statement_timeout='60s'"),
    db.query(`DO $$ BEGIN IF current_database()<>'${database}' OR to_regclass('public.website_findings') IS NULL OR to_regclass('public.client_contacts') IS NULL OR to_regclass('public.client_questionnaires') IS NOT NULL THEN RAISE EXCEPTION 'Unsafe or unexpected schema'; END IF; END $$`),
    ...statements.map(s => db.query(s)),
  ]);
  const after = await inspect(db);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("Legacy data changed during migration");
  const columns = await db.query("select table_name,column_name,column_default,is_nullable from information_schema.columns where table_name in ('client_questionnaires','questionnaire_rate_limits') order by table_name,ordinal_position");
  const constraints = await db.query("select conname,convalidated,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid in ('client_questionnaires'::regclass,'questionnaire_rate_limits'::regclass) order by conname");
  const indexes = await db.query("select indexname,indexdef from pg_indexes where tablename in ('client_questionnaires','questionnaire_rate_limits') order by indexname");
  if (columns.length !== 20 || !constraints.every(c => c.convalidated) || !indexes.some(i => i.indexname === "client_questionnaires_token_idx" && i.indexdef.includes("WHERE"))) throw Error("Schema verification failed");
  return { before, after, columns, constraints, indexes, legacyUnchanged: true };
}
fs.mkdirSync(".tmp/epic3", { recursive: true, mode: 0o700 });
target.pathname = "/neondb";
const admin = neon(target.href);
const rehearsalName = "addz_epic3_migration_validation";
if ((await admin.query("select 1 from pg_database where datname=$1", [rehearsalName])).length) throw Error("Rehearsal DB already exists; refusing overwrite");
await admin.query("CREATE DATABASE " + rehearsalName);
target.pathname = "/" + rehearsalName;
const rehearsal = neon(target.href);
const baseline = spawnSync("git", ["show", "5c048db:src/lib/schema.ts"], { encoding: "utf8" });
if (baseline.status !== 0) throw Error("Cannot read Epic 2 baseline");
fs.writeFileSync(".tmp/epic3/baseline-schema.ts", baseline.stdout, { mode: 0o600 });
const exported = spawnSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "export", "--dialect=postgresql", "--schema=.tmp/epic3/baseline-schema.ts"], { encoding: "utf8", maxBuffer: 10e6 });
if (exported.status !== 0 || !exported.stdout.startsWith("CREATE TABLE")) throw Error("Cannot export Epic 2 schema");
await rehearsal.transaction(exported.stdout.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean).map(s => rehearsal.query(s)));
await rehearsal.query("ALTER TABLE website_scans ALTER CONSTRAINT website_scans_previous_fk DEFERRABLE INITIALLY DEFERRED");
await rehearsal.query("ALTER TABLE website_findings ALTER CONSTRAINT website_findings_ai_run_fk DEFERRABLE INITIALLY DEFERRED");
await rehearsal.query("insert into users(id,email,role) values('epic3-migration','migration@example.test','admin')");
await rehearsal.query("insert into clients(name,package_code,monthly_retainer_amount,one_time_amount,included_services) values('[TEST] Epic 3 legacy integrity','email_5',3200,500,'[{\"code\":\"newsletter\"}]')");
await rehearsal.query("insert into client_contacts(client_id,name,is_primary) select id,'Synthetic primary contact',true from clients");
const rehearsalResult = await migrate(rehearsal, rehearsalName);
const e2e = new URL(config.E2E_DATABASE_URL);
if (!(await isolated.query("select to_regclass('public.client_questionnaires') as existing"))[0].existing) {
  await migrate(isolated, "addz_epic2_validation");
} else throw Error("E2E Epic 3 schema already exists; inspect instead of replay");
fs.writeFileSync(".tmp/epic3/migration-report.json", JSON.stringify({ host, database: rehearsalName, migration: "0020 only", transaction: true, ...rehearsalResult }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ host, rehearsalDatabase: rehearsalName, testDatabase: e2e.pathname.slice(1), columns: rehearsalResult.columns.length, constraints: rehearsalResult.constraints.length, indexes: rehearsalResult.indexes.length, legacyUnchanged: true, productionTouched: false }));
