-- Athleta Front of House — seed data
-- ============================================================
-- HOW TO CREATE TEST AUTH USERS
-- ============================================================
-- Option A (recommended for local dev): hit GET /api/seed in
-- the running app. It calls the Supabase Admin API to create
-- all four test users and their app_users rows automatically.
-- Only works when NODE_ENV=development OR ALLOW_SEED=true.
--
-- Option B (manual): in the Supabase Dashboard go to
-- Authentication → Users → "Invite user" (or "Add user") and
-- create each address below. Then run the INSERT statements
-- at the bottom of this file in the SQL editor, replacing the
-- placeholder UUIDs with the real auth.users UUIDs that
-- Supabase generated.
--
-- Test credentials (all share the same password):
--   receptionist@athleta.test  /  Test1234!  →  receptionist, Coolaroo
--   sitelead@athleta.test      /  Test1234!  →  site_lead,    Altona North
--   admin@athleta.test         /  Test1234!  →  admin,        (both sites)
--   management@athleta.test    /  Test1234!  →  management,   (both sites)
-- ============================================================

-- Programmes (reference data — safe to run unconditionally)
insert into programmes (id, name, min_age, max_age, sort, active) values
  ('00000000-0000-0000-0000-000000000101', 'Kinder Gym',             2,  4,  1, true),
  ('00000000-0000-0000-0000-000000000102', 'Beginners Principles',   5,  7,  2, true),
  ('00000000-0000-0000-0000-000000000103', 'Level 1',                6,  8,  3, true),
  ('00000000-0000-0000-0000-000000000104', 'Level 2',                7, 10,  4, true),
  ('00000000-0000-0000-0000-000000000105', 'Level 3',                8, 12,  5, true),
  ('00000000-0000-0000-0000-000000000106', 'Pre-Squad',              9, 13,  6, true),
  ('00000000-0000-0000-0000-000000000107', 'Squad',                 10, 18,  7, true)
on conflict (id) do nothing;

-- ============================================================
-- app_users — replace placeholder UUIDs with real auth.users
-- UUIDs ONLY if using Option B (manual).
-- The /api/seed route handles this automatically.
-- ============================================================

-- insert into app_users (id, name, email, role, site, active) values
--   ('<auth-uuid-receptionist>', 'Chiara Russo',    'receptionist@athleta.test', 'receptionist', 'coolaroo',     true),
--   ('<auth-uuid-sitelead>',     'Mustafa Demir',   'sitelead@athleta.test',     'site_lead',    'altona_north', true),
--   ('<auth-uuid-admin>',        'Admin User',      'admin@athleta.test',        'admin',         null,          true),
--   ('<auth-uuid-management>',   'Management User', 'management@athleta.test',   'management',    null,          true)
-- on conflict (id) do nothing;

-- ============================================================
-- Sample guardian + leads (Osman two-child family from prototype)
-- ============================================================
insert into guardians (id, first_name, last_name, phone, email, preferred_contact) values
  ('00000000-0000-0000-0000-000000000201', 'Fatima', 'Osman', '0412 345 678', 'fatima.osman@example.com', 'call')
on conflict (id) do nothing;

-- Lead 1: Amira Osman (younger child)
insert into leads (
  id, guardian_id, relationship, child_first, child_last, dob, gender,
  site, programme_id, source, status, contacted, attempts, rebooks,
  next_action_at, created_at
) values (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000201',
  'mother', 'Amira', 'Osman', '2020-03-14', 'female',
  'coolaroo', '00000000-0000-0000-0000-000000000101',
  'website', 'new', false, 0, 0,
  (now() + interval '1 day'),
  now()
) on conflict (id) do nothing;

-- Lead 2: Yusuf Osman (older child)
insert into leads (
  id, guardian_id, relationship, child_first, child_last, dob, gender,
  site, programme_id, source, status, contacted, attempts, rebooks,
  next_action_at, created_at
) values (
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000201',
  'mother', 'Yusuf', 'Osman', '2017-08-22', 'male',
  'coolaroo', '00000000-0000-0000-0000-000000000103',
  'website', 'booked', true, 2, 1,
  (now() + interval '2 days'),
  now()
) on conflict (id) do nothing;
