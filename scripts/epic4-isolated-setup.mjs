import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const config = JSON.parse(fs.readFileSync(".tmp/epic2/environment.json", "utf8"));
const target = new URL(config.E2E_DATABASE_URL);
const host = "ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech";
if (process.env.VERCEL || !process.version.startsWith("v22.") || target.hostname !== host || target.pathname !== "/addz_epic2_validation") throw Error("Unsafe isolated Epic 4 target");
const statements = fs.readFileSync("db/migrations/0021_kickoff_characterization.sql", "utf8").split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
async function markers(db) {
  const tables = await db.query("select tablename from pg_tables where schemaname='public' and tablename <> 'client_characterizations' order by tablename");
  const data = {};
  for (const { tablename } of tables) {
    if (!/^[a-z_]+$/.test(tablename)) throw Error("Unsafe table identifier");
    data[tablename] = (await db.query(`select count(*)::int as count,md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) as hash from "${tablename}" t`))[0];
  }
  const schema = await db.query("select table_name,column_name,data_type,column_default,is_nullable from information_schema.columns where table_schema='public' and table_name<>'client_characterizations' order by table_name,ordinal_position");
  return { data, schema };
}
const results = [];
for (const database of ["addz_epic3_migration_validation", "addz_epic2_validation"]) {
  target.pathname = "/" + database;
  const db = neon(target.href), before = await markers(db);
  const [{ existing, questionnaire, contacts }] = await db.query("select to_regclass('public.client_characterizations') as existing,to_regclass('public.client_questionnaires') as questionnaire,to_regclass('public.client_contacts') as contacts");
  if (!questionnaire || !contacts) throw Error("Epic 3 baseline absent; refusing historical replay");
  if (!existing) await db.transaction([
    db.query("set local lock_timeout='5s'"), db.query("set local statement_timeout='60s'"),
    db.query(`DO $$ BEGIN IF current_database()<>'${database}' OR to_regclass('public.client_characterizations') IS NOT NULL THEN RAISE EXCEPTION 'Unsafe schema'; END IF; END $$`),
    ...statements.map(s => db.query(s)),
  ]);
  const after = await markers(db);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("Legacy schema/data changed");
  const columns = await db.query("select column_name,column_default,is_nullable from information_schema.columns where table_schema='public' and table_name='client_characterizations' order by ordinal_position");
  const constraints = await db.query("select conname,convalidated,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='client_characterizations'::regclass order by conname");
  const indexes = await db.query("select indexname,indexdef from pg_indexes where tablename='client_characterizations' order by indexname");
  if (columns.length !== 12 || constraints.length !== 8 || indexes.length !== 3 || !constraints.every(c => c.convalidated) || !indexes.some(i => i.indexname === "client_characterizations_client_idx" && i.indexdef.includes("UNIQUE"))) throw Error("Epic 4 schema mismatch");
  results.push({ database, alreadyPresent: Boolean(existing), before, after, columns, constraints, indexes, legacyUnchanged: true });
}
fs.mkdirSync(".tmp/epic4", { recursive: true, mode: 0o700 });
fs.writeFileSync(".tmp/epic4/migration-report.json", JSON.stringify({ host, productionTouched: false, results }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ host, migration: "0021 only", databases: results.map(r => r.database), columns: 12, constraints: 8, indexes: 3, legacyUnchanged: true, productionTouched: false }));
