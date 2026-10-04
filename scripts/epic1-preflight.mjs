import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const { neon } = require("@neondatabase/serverless");
const target = (value) => {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${decodeURIComponent(url.pathname).replace(/\/+$/, "")}`;
};
const applyTest = process.argv.includes("--apply-test");
if (process.argv.slice(2).some((arg) => arg !== "--apply-test"))
  throw new Error(
    "Only --apply-test is supported. There is no production apply mode.",
  );
if (!process.env.E2E_DATABASE_URL)
  throw new Error("E2E_DATABASE_URL is required.");
if (
  process.env.DATABASE_URL &&
  target(process.env.E2E_DATABASE_URL) === target(process.env.DATABASE_URL)
)
  throw new Error("Test and application databases must be isolated.");
for (const key of applyTest
  ? ["E2E_DATABASE_URL"]
  : ["DATABASE_URL", "E2E_DATABASE_URL"]) {
  if (!process.env[key]) continue;
  const db = neon(process.env[key]);
  const columns = await db.query(
    "select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'clients' order by ordinal_position",
    [],
  );
  const history = await db.query(
    "select table_schema, table_name from information_schema.tables where table_name = '__drizzle_migrations'",
    [],
  );
  const duplicates = await db.query(
    "select count(*)::integer as groups from (select flashy_account_id from flashy_accounts where flashy_account_id is not null group by flashy_account_id having count(*) > 1) d",
    [],
  );
  const relatedColumns = await db.query(
    "select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('client_contacts', 'audit_logs')",
    [],
  );
  const indexes = await db.query(
    "select indexname from pg_indexes where schemaname = 'public' and indexname in ('client_contacts_primary_idx', 'client_contacts_client_idx', 'audit_logs_client_time_idx')",
    [],
  );
  const constraints = await db.query(
    "select conname from pg_constraint where connamespace = 'public'::regnamespace and conname in ('client_contacts_client_id_clients_id_fk', 'audit_logs_client_id_clients_id_fk', 'clients_owner_user_id_users_id_fk')",
    [],
  );
  const missingRelatedSchema = [
    ...[
      "id",
      "client_id",
      "name",
      "job_title",
      "email",
      "phone",
      "is_primary",
      "created_at",
      "updated_at",
    ]
      .filter(
        (name) =>
          !relatedColumns.some(
            (column) =>
              column.table_name === "client_contacts" &&
              column.column_name === name,
          ),
      )
      .map((name) => `client_contacts.${name}`),
    ...["client_id", "actor_type"]
      .filter(
        (name) =>
          !relatedColumns.some(
            (column) =>
              column.table_name === "audit_logs" && column.column_name === name,
          ),
      )
      .map((name) => `audit_logs.${name}`),
    ...[
      "client_contacts_primary_idx",
      "client_contacts_client_idx",
      "audit_logs_client_time_idx",
    ].filter((name) => !indexes.some((index) => index.indexname === name)),
    ...[
      "client_contacts_client_id_clients_id_fk",
      "audit_logs_client_id_clients_id_fk",
      "clients_owner_user_id_users_id_fk",
    ].filter(
      (name) => !constraints.some((constraint) => constraint.conname === name),
    ),
  ];
  console.log(
    JSON.stringify({
      target: key,
      clientColumns: columns,
      migrationHistoryTables: history,
      duplicateFlashyIds: duplicates[0].groups,
      missingRelatedFoundationSchema: missingRelatedSchema,
    }),
  );
  if (!applyTest) continue;
  const [journalTable] = await db.query(
    "select to_regclass('public.account_change_events') as name",
    [],
  );
  if (!journalTable.name) {
    const sql = await readFile(
      new URL(
        "../db/migrations/0016_ambitious_silver_surfer.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.transaction(
      sql
        .split("--> statement-breakpoint")
        .filter((part) => part.trim())
        .map((part) => db.query(part, [])),
    );
    console.log("Applied missing baseline 0016 to isolated E2E database only.");
  }
  const newColumns = [
    "website",
    "package_name",
    "monthly_retainer_amount",
    "included_services",
    "start_date",
    "owner_user_id",
    "internal_notes",
    "onboarding_stage",
    "updated_at",
  ];
  const present = newColumns.filter((name) =>
    columns.some((column) => column.column_name === name),
  );
  if (present.length && present.length !== newColumns.length)
    throw new Error(
      "Partial Epic 1 schema detected. Refusing automatic repair.",
    );
  if (present.length && missingRelatedSchema.length)
    throw new Error(
      "Incomplete Epic 1 contacts/activity constraints detected. Refusing automatic repair.",
    );
  if (!present.length) {
    const sql = await readFile(
      new URL("../db/migrations/0017_public_jazinda.sql", import.meta.url),
      "utf8",
    );
    await db.transaction(
      sql
        .split("--> statement-breakpoint")
        .filter((part) => part.trim())
        .map((part) => db.query(part, [])),
    );
    console.log(
      "Applied additive 0017 to isolated E2E database only. Production was not modified.",
    );
  } else console.log("Epic 1 columns already present; no migration applied.");
}
