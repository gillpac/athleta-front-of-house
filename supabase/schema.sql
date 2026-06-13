-- Athleta Front of House — initial schema (v1)
-- Apply via Supabase SQL editor or migration. RLS policies are Task 01.

create type user_role as enum ('receptionist','site_lead','admin','management');
create type site_t as enum ('coolaroo','altona_north');
create type lead_status as enum ('new','booked','noshow','won','lost','nurture');
create type cancel_stage as enum ('received','save_attempt','processed','verified');
create type cancel_outcome as enum ('departed','saved','paused');

create table app_users (
  id uuid primary key references auth.users(id),
  name text not null,
  email text not null unique,
  role user_role not null,
  site site_t,                          -- null for admin/management (see both)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table programmes (
  id uuid primary key default gen_random_uuid(),
  name text not null,                   -- Kinder Gym, Beginners Principles, Level 1...
  min_age numeric, max_age numeric,     -- for the age auto-suggest rule
  sort int not null default 0,
  active boolean not null default true
);

create table guardians (
  id uuid primary key default gen_random_uuid(),
  first_name text not null, last_name text not null,
  phone text not null, email text,
  preferred_contact text,               -- call / sms / email
  created_at timestamptz not null default now(),
  archived_at timestamptz, archived_by uuid references app_users(id)
);
create index on guardians (phone);
create index on guardians (email);

create table leads (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references guardians(id),
  relationship text,                    -- mother / father / carer (verbatim from enquiry)
  child_first text not null, child_last text not null,
  dob date, gender text,
  site site_t not null,
  programme_id uuid references programmes(id),
  source text not null default 'website',  -- editable dropdown values per scope
  referrer_name text,
  utm_source text, utm_medium text, utm_campaign text,
  status lead_status not null default 'new',
  contacted boolean not null default false,
  last_outcome text,
  attempts int not null default 0,
  rebooks int not null default 0,
  trial_at timestamptz,
  confirmation_sent_at timestamptz,
  form_received boolean not null default false,   -- Jotform medical/needs form
  next_action_at timestamptz,           -- MANDATORY while status not in (won,lost,nurture); enforce in app + check
  first_class_date date, first_class text,
  sold_at timestamptz, sold_by uuid references app_users(id),
  payment_taken boolean not null default false,
  verified_at timestamptz, verified_by uuid references app_users(id),
  lost_reason text,
  nurture_followup_at date,
  enquiry_raw jsonb,                    -- original enquiry verbatim
  received_at timestamptz not null default now(),
  created_by uuid references app_users(id),       -- null = system/webhook
  prev_state jsonb,                     -- for one-step undo
  archived_at timestamptz, archived_by uuid references app_users(id)
);
create index on leads (site, status);
create index on leads (guardian_id);
create index on leads (next_action_at);

create table activities (                -- the per-lead timeline
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  user_id uuid references app_users(id), -- null = system
  kind text not null,                    -- comm / status / note / system / undo / verify
  body text not null,
  created_at timestamptz not null default now()
);
create index on activities (lead_id, created_at);

create table cancellations (
  id uuid primary key default gen_random_uuid(),
  member_name text not null,
  guardian_name text, phone text, email text,
  site site_t not null,
  level text,
  reasons text[] not null default '{}',
  feedback text,
  rating int check (rating between 1 and 5),
  notice_date date not null default current_date,  -- SYSTEM-stamped
  effective_date date not null,                    -- notice + 2 weeks, editable by admin
  stage cancel_stage not null default 'received',
  save_outcome text,
  outcome cancel_outcome,
  outstanding_fees_flag boolean not null default false,
  processed_by uuid references app_users(id),
  verified_at timestamptz, verified_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz, archived_by uuid references app_users(id)
);
create index on cancellations (site, stage);

create table targets (
  id uuid primary key default gen_random_uuid(),
  site site_t not null,
  month date not null,                  -- first of month
  net_growth_goal int not null,
  sales_goal int,
  unique (site, month)
);

create table blockout_days (
  id uuid primary key default gen_random_uuid(),
  site site_t not null,
  day date not null,
  label text not null,                  -- 'Good Friday', 'Christmas shutdown'
  unique (site, day)
);

create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  site site_t,                          -- null = all sites
  role user_role,                       -- null = all roles
  label text not null,
  sort int not null default 0,
  active boolean not null default true
);

create table checklist_completions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references checklist_items(id),
  user_id uuid not null references app_users(id),
  day date not null default current_date,
  completed_at timestamptz not null default now(),
  unique (item_id, user_id, day)
);

create table audit_log (
  id bigint generated always as identity primary key,
  entity text not null, entity_id uuid not null,
  user_id uuid references app_users(id),
  action text not null,
  before jsonb, after jsonb,
  at timestamptz not null default now()
);
create index on audit_log (entity, entity_id);

-- Seed: programmes and starter checklist (edit freely in settings later)
insert into programmes (name, sort) values
 ('Kinder Gym', 1), ('Beginners Principles', 2), ('Level 1', 3), ('Level 2', 4),
 ('Level 3', 5), ('Level 4+', 6), ('Boys', 7);
