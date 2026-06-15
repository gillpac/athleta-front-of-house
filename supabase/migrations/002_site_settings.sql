-- Migration 002: site_settings table for per-site config (member baseline)
create table if not exists site_settings (
  site site_t primary key,
  current_members int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references app_users(id)
);

insert into site_settings (site, current_members)
  values ('coolaroo', 0), ('altona_north', 0)
  on conflict do nothing;

alter table site_settings enable row level security;

create policy "read site_settings" on site_settings
  for select to authenticated using (true);

create policy "write site_settings" on site_settings
  for all to authenticated
  using (auth_role() in ('admin','management'))
  with check (auth_role() in ('admin','management'));
