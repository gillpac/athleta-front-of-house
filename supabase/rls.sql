-- Athleta Front of House — RLS policies (Task 01)
-- Run in Supabase SQL editor AFTER schema.sql has been applied.
-- Service role bypasses all RLS automatically (Supabase default).

-- ────────────────────────────────────────────────────────────────
-- Helper functions
-- ────────────────────────────────────────────────────────────────

create or replace function auth_site() returns site_t
  language sql security definer stable as $$
    select site from app_users where id = auth.uid()
$$;

create or replace function auth_role() returns user_role
  language sql security definer stable as $$
    select role from app_users where id = auth.uid()
$$;

-- ────────────────────────────────────────────────────────────────
-- Enable RLS on every table
-- ────────────────────────────────────────────────────────────────

alter table app_users             enable row level security;
alter table programmes            enable row level security;
alter table guardians             enable row level security;
alter table leads                 enable row level security;
alter table activities            enable row level security;
alter table cancellations         enable row level security;
alter table targets               enable row level security;
alter table blockout_days         enable row level security;
alter table checklist_items       enable row level security;
alter table checklist_completions enable row level security;
alter table audit_log             enable row level security;

-- ────────────────────────────────────────────────────────────────
-- app_users
-- ────────────────────────────────────────────────────────────────

create policy "app_users_read_own" on app_users
  for select to authenticated
  using (id = auth.uid() or auth_role() in ('admin','management'));

create policy "app_users_insert_admin" on app_users
  for insert to authenticated
  with check (auth_role() in ('admin','management'));

create policy "app_users_update_admin" on app_users
  for update to authenticated
  using (auth_role() in ('admin','management'))
  with check (auth_role() in ('admin','management'));

-- ────────────────────────────────────────────────────────────────
-- programmes
-- ────────────────────────────────────────────────────────────────

create policy "programmes_read" on programmes
  for select to authenticated
  using (true);

create policy "programmes_insert_admin" on programmes
  for insert to authenticated
  with check (auth_role() in ('admin','management'));

create policy "programmes_update_admin" on programmes
  for update to authenticated
  using (auth_role() in ('admin','management'))
  with check (auth_role() in ('admin','management'));

-- ────────────────────────────────────────────────────────────────
-- guardians  (site-scoped via their leads; no direct site column)
-- Receptionists/site_leads can see guardians that have at least one
-- lead at their site. Admin/management see all.
-- ────────────────────────────────────────────────────────────────

create policy "guardians_read" on guardians
  for select to authenticated
  using (
    auth_role() in ('admin','management')
    or exists (
      select 1 from leads l
      where l.guardian_id = guardians.id
        and l.site = auth_site()
    )
  );

create policy "guardians_insert" on guardians
  for insert to authenticated
  with check (true);  -- any authenticated user can create a guardian (lead intake)

create policy "guardians_update" on guardians
  for update to authenticated
  using (
    auth_role() in ('admin','management')
    or exists (
      select 1 from leads l
      where l.guardian_id = guardians.id
        and l.site = auth_site()
    )
  )
  with check (true);

-- ────────────────────────────────────────────────────────────────
-- leads
-- ────────────────────────────────────────────────────────────────

create policy "leads_read" on leads
  for select to authenticated
  using (site = auth_site() or auth_role() in ('admin','management'));

create policy "leads_insert" on leads
  for insert to authenticated
  with check (site = auth_site() or auth_role() in ('admin','management'));

create policy "leads_update" on leads
  for update to authenticated
  using (site = auth_site() or auth_role() in ('admin','management'))
  with check (site = auth_site() or auth_role() in ('admin','management'));

-- ────────────────────────────────────────────────────────────────
-- activities
-- ────────────────────────────────────────────────────────────────

create policy "activities_read" on activities
  for select to authenticated
  using (
    auth_role() in ('admin','management')
    or exists (
      select 1 from leads l
      where l.id = activities.lead_id
        and l.site = auth_site()
    )
  );

create policy "activities_insert" on activities
  for insert to authenticated
  with check (
    auth_role() in ('admin','management')
    or exists (
      select 1 from leads l
      where l.id = lead_id
        and l.site = auth_site()
    )
  );

create policy "activities_update" on activities
  for update to authenticated
  using (
    auth_role() in ('admin','management')
    or exists (
      select 1 from leads l
      where l.id = activities.lead_id
        and l.site = auth_site()
    )
  )
  with check (true);

-- ────────────────────────────────────────────────────────────────
-- cancellations
-- ────────────────────────────────────────────────────────────────

create policy "cancellations_read" on cancellations
  for select to authenticated
  using (site = auth_site() or auth_role() in ('admin','management'));

create policy "cancellations_insert" on cancellations
  for insert to authenticated
  with check (site = auth_site() or auth_role() in ('admin','management'));

create policy "cancellations_update" on cancellations
  for update to authenticated
  using (site = auth_site() or auth_role() in ('admin','management'))
  with check (site = auth_site() or auth_role() in ('admin','management'));

-- ────────────────────────────────────────────────────────────────
-- targets
-- ────────────────────────────────────────────────────────────────

create policy "targets_read" on targets
  for select to authenticated
  using (site = auth_site() or auth_role() in ('admin','management'));

create policy "targets_insert_admin" on targets
  for insert to authenticated
  with check (auth_role() in ('admin','management'));

create policy "targets_update_admin" on targets
  for update to authenticated
  using (auth_role() in ('admin','management'))
  with check (auth_role() in ('admin','management'));

-- ────────────────────────────────────────────────────────────────
-- blockout_days
-- ────────────────────────────────────────────────────────────────

create policy "blockout_days_read" on blockout_days
  for select to authenticated
  using (site = auth_site() or auth_role() in ('admin','management'));

create policy "blockout_days_insert_admin" on blockout_days
  for insert to authenticated
  with check (auth_role() in ('admin','management'));

create policy "blockout_days_update_admin" on blockout_days
  for update to authenticated
  using (auth_role() in ('admin','management'))
  with check (auth_role() in ('admin','management'));

-- ────────────────────────────────────────────────────────────────
-- checklist_items
-- ────────────────────────────────────────────────────────────────

create policy "checklist_items_read" on checklist_items
  for select to authenticated
  using (site is null or site = auth_site() or auth_role() in ('admin','management'));

create policy "checklist_items_insert_admin" on checklist_items
  for insert to authenticated
  with check (auth_role() in ('admin','management'));

create policy "checklist_items_update_admin" on checklist_items
  for update to authenticated
  using (auth_role() in ('admin','management'))
  with check (auth_role() in ('admin','management'));

-- ────────────────────────────────────────────────────────────────
-- checklist_completions
-- ────────────────────────────────────────────────────────────────

create policy "checklist_completions_read" on checklist_completions
  for select to authenticated
  using (
    user_id = auth.uid()
    or auth_role() in ('admin','management')
    or exists (
      select 1 from app_users au
      where au.id = checklist_completions.user_id
        and au.site = auth_site()
    )
  );

create policy "checklist_completions_insert" on checklist_completions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "checklist_completions_update" on checklist_completions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────
-- audit_log — all authenticated can read; writes go via service role
-- ────────────────────────────────────────────────────────────────

create policy "audit_log_read" on audit_log
  for select to authenticated
  using (true);

-- No INSERT/UPDATE policies for authenticated users — all writes are
-- done via the admin client (service role) in lib/audit.ts, which
-- bypasses RLS. This prevents any client-side tampering.
