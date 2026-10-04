import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import nextEnv from '@next/env';
import { neon } from '@neondatabase/serverless';
nextEnv.loadEnvConfig(process.cwd());
const target = new URL(process.env.DATABASE_URL);
// Credentials are reused only to connect to the already preserved ISOLATED rehearsal branch.
// No query or subprocess is ever directed to the application/Production endpoint.
target.hostname = 'ep-summer-waterfall-aprx73rb.c-7.us-east-1.aws.neon.tech';
target.pathname = '/neondb';
const sql = neon(target.toString());
const finalCheck = process.env.EPIC2_MIGRATION_CHECK === '1';
const database = finalCheck ? 'addz_epic2_migration_validation' : 'addz_epic2_validation';
fs.mkdirSync('.tmp/epic2', { recursive: true, mode: 0o700 });
if (!(await sql.query('select 1 from pg_database where datname=$1', [database])).length) await sql.query('CREATE DATABASE ' + database);
const baseline = spawnSync('git', ['show', '63f42e4b121a6e22aaf81a140e8cd21d3bbd7f4c:src/lib/schema.ts'], { encoding: 'utf8' });
if (baseline.status !== 0) throw Error('Cannot read approved baseline');
fs.writeFileSync('.tmp/epic2/baseline-schema.ts', baseline.stdout, { mode: 0o600 });
const exported = spawnSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'export', '--dialect=postgresql', '--schema=.tmp/epic2/baseline-schema.ts'], { encoding: 'utf8', maxBuffer: 10e6 });
if (exported.status !== 0 || !exported.stdout.startsWith('CREATE TABLE')) throw Error('Cannot export baseline schema');
fs.writeFileSync('.tmp/epic2/baseline.sql', exported.stdout, { mode: 0o600 });
target.pathname = '/' + database;
const isolated = neon(target.toString());
if ((await isolated.query("select count(*)::int as count from pg_tables where schemaname='public'"))[0].count !== 0) throw Error('Validation database not empty; refusing overwrite');
await isolated.transaction(exported.stdout.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean).map(statement => isolated.query(statement)));
const before = await isolated.query("select tablename from pg_tables where schemaname='public' order by tablename");
if ((await isolated.query('select count(*)::int as count from clients'))[0].count !== 0) throw Error('Expected empty synthetic database');
if (finalCheck) await isolated.query("insert into clients(name,website) values('[TEST] Pre-Epic 2 synthetic record','https://example.com/')");
const beforeRows = await isolated.query("select count(*)::int as count,md5(coalesce(string_agg(to_jsonb(c)::text,'' order by id),'')) as hash from clients c");
if ((await isolated.query("select to_regclass('public.website_scans') as existing"))[0].existing) throw Error('Unexpected Epic 2 schema');
const migration = fs.readFileSync('db/migrations/0019_website_intelligence.sql', 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
await isolated.transaction([
  isolated.query("set local lock_timeout='5s'"), isolated.query("set local statement_timeout='60s'"),
  isolated.query(`DO $$ BEGIN IF current_database()<>'${database}' OR to_regclass('public.client_contacts') IS NULL THEN RAISE EXCEPTION 'Unsafe migration target'; END IF; END $$`),
  ...migration.map(statement => isolated.query(statement)),
]);
const after = await isolated.query("select tablename from pg_tables where schemaname='public' order by tablename");
const constraints = await isolated.query("select conname,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid in ('website_scans'::regclass,'website_scan_sources'::regclass,'website_findings'::regclass,'ai_runs'::regclass) order by conname");
const indexes = await isolated.query("select tablename,indexname,indexdef from pg_indexes where tablename in ('website_scans','website_scan_sources','website_findings','ai_runs') order by indexname");
const columns = await isolated.query("select table_name,column_name,column_default,is_nullable,udt_name from information_schema.columns where table_name in ('website_scans','website_scan_sources','website_findings','ai_runs') order by table_name,ordinal_position");
const afterRows = await isolated.query("select count(*)::int as count,md5(coalesce(string_agg(to_jsonb(c)::text,'' order by id),'')) as hash from clients c");
if (JSON.stringify(beforeRows) !== JSON.stringify(afterRows) || !constraints.every(row => row.convalidated) || constraints.filter(row => row.condeferrable && row.condeferred).length !== 2) throw Error('Migration integrity verification failed');
if (!finalCheck) fs.writeFileSync('.tmp/epic2/environment.json', JSON.stringify({ E2E_DATABASE_URL: target.toString() }), { mode: 0o600 });
fs.writeFileSync('.tmp/epic2/' + (finalCheck ? 'final-migration-report.json' : 'schema-report.json'), JSON.stringify({ hostname: target.hostname, database, before, after, constraints, columns, indexes, beforeRows, afterRows }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ hostname: target.hostname, database, baselineTables: before.length, migratedTables: after.length, constraints: constraints.length, indexes: indexes.length, clients: afterRows[0].count, legacyUnchanged: true, migration: '0019 only, atomic', productionTouched: false }));
