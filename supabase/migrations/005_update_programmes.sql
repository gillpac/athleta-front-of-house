-- Replace legacy multi-level programme list with the three streamlined programs
-- Existing leads keep their foreign key; old programmes are deactivated.
update programmes set active = false;

-- Rename "Kinder Gym" to "KinderGym" in place (keeps its UUID, won't break FK refs)
update programmes set name = 'KinderGym', sort = 1, min_age = null, max_age = null where name = 'Kinder Gym';

-- Add new programmes only if they don''t already exist
insert into programmes (name, sort, active)
  select 'Principles Development', 2, true
  where not exists (select 1 from programmes where name = 'Principles Development');

insert into programmes (name, sort, active)
  select 'Other', 99, true
  where not exists (select 1 from programmes where name = 'Other');

-- Reactivate the three core programmes
update programmes set active = true where name in ('KinderGym', 'Principles Development', 'Other');
