-- Explicit one-time reset requested by the owner. A durable marker prevents reruns
-- from deleting any groups that people create after the reset.
begin;
create table if not exists doin_private.maintenance_actions (request text primary key, completed_at timestamptz not null default now());
alter table doin_private.maintenance_actions enable row level security;
revoke all on doin_private.maintenance_actions from public,anon,authenticated;
do $$
begin
 perform pg_advisory_xact_lock(81713,55109);
 if not exists(select 1 from doin_private.maintenance_actions where request='reset-groups-6eb07f62c9774b499ad8') then
  delete from doin_private.groups;
  if exists(select 1 from doin_private.members) or exists(select 1 from doin_private.events) or exists(select 1 from doin_private.responses) then raise exception 'Reset did not complete; rolled back.';end if;
  insert into doin_private.maintenance_actions(request) values('reset-groups-6eb07f62c9774b499ad8');
 end if;
end $$;
commit;
