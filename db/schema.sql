create table users (
  id text primary key,
  name text,
  email text not null unique,
  email_verified timestamptz,
  image text,
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

create table accounts (
  user_id text not null references users(id) on delete cascade,
  type text not null,
  provider text not null,
  provider_account_id text not null,
  refresh_token text,
  access_token text,
  expires_at integer,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  unique(provider, provider_account_id)
);

create table sessions (
  session_token text primary key,
  user_id text not null references users(id) on delete cascade,
  expires timestamptz not null
);

create table verification_tokens (
  identifier text not null,
  token text not null,
  expires timestamptz not null,
  primary key(identifier, token)
);

create table authenticators (
  credential_id text not null unique,
  user_id text not null references users(id) on delete cascade,
  provider_account_id text not null,
  credential_public_key text not null,
  counter integer not null,
  credential_device_type text not null,
  credential_backed_up boolean not null,
  transports text,
  primary key(user_id, credential_id)
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner text,
  industry text,
  visible_modules text[] not null default array['reports', 'planner', 'ai'],
  created_at timestamptz not null default now()
);

create table client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(client_id, user_id)
);

create table flashy_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  flashy_account_id integer,
  name text not null,
  website text,
  currency text not null default 'ILS',
  timezone text not null default 'Asia/Jerusalem',
  encrypted_api_key text not null,
  usd_ils_rate numeric(10, 4) not null default 3.7,
  sms_credit_price_usd numeric(10, 4) not null default 0,
  monthly_subscription_cost_usd numeric(12, 2) not null default 0,
  agency_retainer_cost_ils numeric(12, 2) not null default 0,
  active boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  flashy_account_id uuid references flashy_accounts(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text
);

create table email_campaign_reports (
  id uuid primary key default gen_random_uuid(),
  flashy_account_id uuid references flashy_accounts(id) on delete cascade,
  campaign_id integer not null,
  sent_at timestamptz not null,
  campaign_name text,
  subject_line text,
  total_recipients integer not null default 0,
  total_delivered integer not null default 0,
  total_opens integer not null default 0,
  total_clicks integer not null default 0,
  purchases integer not null default 0,
  revenue_generated numeric(12, 2) not null default 0,
  raw jsonb not null default '{}'::jsonb,
  unique (flashy_account_id, campaign_id, sent_at)
);

create table sms_campaign_reports (
  id uuid primary key default gen_random_uuid(),
  flashy_account_id uuid references flashy_accounts(id) on delete cascade,
  campaign_id integer not null,
  sent_at timestamptz not null,
  campaign_name text,
  total_recipients integer not null default 0,
  total_delivered integer not null default 0,
  total_clicks integer not null default 0,
  purchases integer not null default 0,
  revenue_generated numeric(12, 2) not null default 0,
  raw jsonb not null default '{}'::jsonb,
  unique (flashy_account_id, campaign_id, sent_at)
);

create table automation_reports (
  id uuid primary key default gen_random_uuid(),
  flashy_account_id uuid references flashy_accounts(id) on delete cascade,
  automation_id integer not null,
  report_date date not null,
  automation_name text,
  channel text not null check (channel in ('email', 'sms')),
  total_recipients integer not null default 0,
  total_delivered integer not null default 0,
  total_opens integer not null default 0,
  total_clicks integer not null default 0,
  sent_emails integer not null default 0,
  opened_emails integer not null default 0,
  clicked_emails integer not null default 0,
  sent_sms integer not null default 0,
  clicked_sms integer not null default 0,
  total_entered integer not null default 0,
  total_completed integer not null default 0,
  failed_messages integer not null default 0,
  purchases integer not null default 0,
  revenue_generated numeric(12, 2) not null default 0,
  raw jsonb not null default '{}'::jsonb,
  unique (flashy_account_id, automation_id, report_date, channel)
);

create table newsletter_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  flashy_account_id uuid references flashy_accounts(id) on delete cascade,
  planned_date date not null,
  channel text not null check (channel in ('email', 'sms')),
  kind text not null check (kind in ('campaign', 'automation')),
  status text not null check (status in ('draft', 'ready', 'approved', 'sent')),
  title text not null,
  owner text,
  notes text,
  flashy_url text,
  asset_url text,
  created_at timestamptz not null default now()
);

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  category text not null,
  priority text not null check (priority in ('high', 'medium', 'low')),
  body text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create table ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  user_id text references users(id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
