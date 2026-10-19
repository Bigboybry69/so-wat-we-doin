-- Keep one member identity across browsers/Home Screen installs.
-- Existing member credentials resolve to one canonical membership.
begin;
create table if not exists doin_private.member_credentials (
 token_hash bytea primary key, member uuid not null references doin_private.members(id) on delete cascade
);
alter table doin_private.member_credentials enable row level security;
revoke all on doin_private.member_credentials from public,anon,authenticated;
create index if not exists doin_credentials_member on doin_private.member_credentials(member);
insert into doin_private.member_credentials(token_hash,member) select token_hash,id from doin_private.members on conflict do nothing;
create or replace function doin_private.register_member_credential() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into doin_private.member_credentials(token_hash,member) values(new.token_hash,new.id);
 return new;
end $$;
drop trigger if exists doin_member_credential on doin_private.members;
create trigger doin_member_credential after insert on doin_private.members for each row execute function doin_private.register_member_credential();
create or replace function doin_private.require_member(p_token text) returns doin_private.members
language plpgsql security definer set search_path='' as $$
declare m doin_private.members;
begin
 select x.* into m from doin_private.member_credentials c join doin_private.members x on x.id=c.member where c.token_hash=sha256(convert_to(p_token,'UTF8'));
 if m.id is null then raise exception 'Please join or create a group.';end if;
 return m;
end $$;
create or replace function public.doin_join(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g uuid; existing_id uuid; name_value text; t text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 select id into g from doin_private.groups where id::text=p_data->>'invite';
 if g is null then raise exception 'That invite was not found.';end if;
 select x.id into existing_id from doin_private.member_credentials c join doin_private.members x on x.id=c.member where c.token_hash=sha256(convert_to(p_token,'UTF8')) and x.gid=g;
 if existing_id is not null then return jsonb_build_object('token',p_token,'invite',g);end if;
 name_value:=doin_private.clean_text(p_data->>'name',40);
 perform pg_advisory_xact_lock(hashtext(g::text),hashtext(lower(name_value)));
 if exists(select 1 from doin_private.members where gid=g and lower(btrim(name))=lower(name_value)) then
  raise exception 'That name is already in this group. Use your private sign-in code to sign back in. If you are a different person, choose a distinct name.';
 end if;
 insert into doin_private.members(token_hash,gid,name) values(sha256(convert_to(t,'UTF8')),g,name_value);
 return jsonb_build_object('token',t,'invite',g);
end $$;
revoke all on function doin_private.register_member_credential(),doin_private.require_member(text) from public,anon,authenticated;
revoke all on function public.doin_join(text,jsonb) from public;
grant execute on function public.doin_join(text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
