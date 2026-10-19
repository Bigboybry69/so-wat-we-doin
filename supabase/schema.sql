-- Run this complete file once in Supabase -> SQL Editor. Safe to rerun.
-- Tables are private. The public key can only call the explicitly granted functions below.
begin;
create schema if not exists doin_private;
revoke all on schema doin_private from public, anon, authenticated;
create table if not exists doin_private.groups (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120)
);
create table if not exists doin_private.members (
 id uuid primary key default gen_random_uuid(), token_hash bytea unique not null,
 gid uuid not null references doin_private.groups(id) on delete cascade,
 name text not null check(length(name) between 1 and 40)
);
create table if not exists doin_private.events (
 id uuid primary key default gen_random_uuid(), gid uuid not null references doin_private.groups(id) on delete cascade,
 title text not null check(length(title) between 1 and 120), url text not null default '',
 place text not null check(length(place) between 1 and 120), starts timestamptz not null, ends timestamptz not null,
 category text not null check(category in ('Music','Food','Outdoors','Arts','Hangout')),
 author text not null, check(ends>starts), check(url='' or url ~* '^https?://[^[:space:]]+$'), check(length(url)<=2048)
);
alter table doin_private.events add column if not exists added_by uuid references doin_private.members(id) on delete set null;
create table if not exists doin_private.responses (
 event uuid not null references doin_private.events(id) on delete cascade,
 member uuid not null references doin_private.members(id) on delete cascade,
 vote integer not null check(vote in (0,1)), status text not null check(status in ('going','maybe','out')),
 seats integer not null check(seats between 0 and 8), primary key(event,member), check(status='going' or seats=0)
);
create index if not exists doin_members_gid on doin_private.members(gid);
create index if not exists doin_events_gid on doin_private.events(gid,starts);
alter table doin_private.groups enable row level security;
alter table doin_private.members enable row level security;
alter table doin_private.events enable row level security;
alter table doin_private.responses enable row level security;
revoke all on all tables in schema doin_private from public,anon,authenticated;

create or replace function doin_private.clean_text(value text, max_length integer) returns text
language plpgsql set search_path='' as $$
begin
 if value is null or length(btrim(value))=0 or length(value)>max_length then
  raise exception 'Please check the required fields.';
 end if;
 return btrim(value);
end $$;
create or replace function doin_private.require_member(p_token text) returns doin_private.members
language plpgsql security definer set search_path='' as $$
declare m doin_private.members;
begin
 select * into m from doin_private.members where token_hash=sha256(convert_to(p_token,'UTF8'));
 if m.id is null then raise exception 'Please join or create a group.'; end if;
 return m;
end $$;

create or replace function public.doin_create_group(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g uuid; t text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 insert into doin_private.groups(name) values (doin_private.clean_text(p_data->>'group',120)) returning id into g;
 insert into doin_private.members(token_hash,gid,name) values(sha256(convert_to(t,'UTF8')),g,doin_private.clean_text(p_data->>'name',40));
 return jsonb_build_object('token',t,'invite',g);
end $$;

create or replace function public.doin_join(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g uuid; t text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 select id into g from doin_private.groups where id::text=p_data->>'invite';
 if g is null then raise exception 'That invite was not found.'; end if;
 insert into doin_private.members(token_hash,gid,name) values(sha256(convert_to(t,'UTF8')),g,doin_private.clean_text(p_data->>'name',40));
 return jsonb_build_object('token',t,'invite',g);
end $$;

create or replace function public.doin_state(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); result jsonb;
begin
 select jsonb_build_object(
  'group',(select jsonb_build_object('id',g.id,'name',g.name) from doin_private.groups g where g.id=m.gid),
  'me',jsonb_build_object('name',m.name,'id',m.id),
  'members',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) order by x.name,x.id),'[]'::jsonb) from doin_private.members x where x.gid=m.gid),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'url',e.url,'place',e.place,'starts',e.starts,'ends',e.ends,'category',e.category,'author',e.author,'canDelete',coalesce(e.added_by=m.id,false),'creatorKnown',e.added_by is not null,
   'responses',(select coalesce(jsonb_agg(jsonb_build_object('personId',x.id,'name',x.name,'mine',x.id=m.id,'vote',r.vote,'status',r.status,'seats',r.seats) order by x.name,x.id),'[]'::jsonb)
     from doin_private.responses r join doin_private.members x on x.id=r.member where r.event=e.id)
  ) order by e.starts,e.id),'[]'::jsonb) from doin_private.events e where e.gid=m.gid)
 ) into result;
 return result;
end $$;

create or replace function public.doin_add_event(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); eid uuid;
 s timestamptz; en timestamptz; link text:=coalesce(p_data->>'url','');
begin
 begin s:=(p_data->>'starts')::timestamptz;en:=(p_data->>'ends')::timestamptz;
 exception when others then raise exception 'Enter valid event dates.';end;
 if s is null or en is null or not isfinite(s) or not isfinite(en) or en<=s then raise exception 'End time must be after start time.';end if;
 if length(link)>2048 or (link<>'' and link !~* '^https?://[^[:space:]]+$') then raise exception 'Enter a valid website link.';end if;
 insert into doin_private.events(gid,title,url,place,starts,ends,category,author,added_by)
 values(m.gid,doin_private.clean_text(p_data->>'title',120),link,doin_private.clean_text(p_data->>'place',120),s,en,
 case when p_data->>'category' in ('Music','Food','Outdoors','Arts','Hangout') then p_data->>'category' else 'Hangout' end,m.name,m.id) returning id into eid;
 return jsonb_build_object('id',eid);
end $$;

create or replace function public.doin_respond(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); eid uuid;
 v integer; s integer; st text:=p_data->>'status';
begin
 select id into eid from doin_private.events where id::text=p_data->>'event' and gid=m.gid;
 if eid is null then raise exception 'Event not found.';end if;
 if coalesce(p_data->>'vote','') not in ('0','1') or coalesce(p_data->>'seats','') !~ '^[0-8]$' or st is null or st not in ('going','maybe','out') then raise exception 'Invalid response.';end if;
 v:=(p_data->>'vote')::integer;s:=case when st='going' then (p_data->>'seats')::integer else 0 end;
 insert into doin_private.responses(event,member,vote,status,seats) values(eid,m.id,v,st,s)
 on conflict(event,member) do update set vote=excluded.vote,status=excluded.status,seats=excluded.seats;
 return jsonb_build_object('ok',true);
end $$;
revoke all on all functions in schema doin_private from public,anon,authenticated;
revoke all on function public.doin_create_group(text,jsonb),public.doin_join(text,jsonb),public.doin_state(text,jsonb),public.doin_add_event(text,jsonb),public.doin_respond(text,jsonb) from public;
grant execute on function public.doin_create_group(text,jsonb),public.doin_join(text,jsonb),public.doin_state(text,jsonb),public.doin_add_event(text,jsonb),public.doin_respond(text,jsonb) to anon,authenticated;
commit;
-- One-time update: run this file in Supabase SQL Editor. Safe to repeat.
-- Any member can rename their own group. IDs, invites, and events stay unchanged.
begin;
create or replace function public.doin_update_group(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); new_name text;
begin
 new_name:=doin_private.clean_text(p_data->>'name',120);
 update doin_private.groups set name=new_name where id=m.gid;
 return jsonb_build_object('id',m.gid,'name',new_name);
end $$;
revoke all on function public.doin_update_group(text,jsonb) from public;
grant execute on function public.doin_update_group(text,jsonb) to anon,authenticated;
commit;

-- Only the recorded creator can remove an event.
begin;
create or replace function public.doin_delete_event(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); deleted_id uuid;
begin
 delete from doin_private.events where id::text=p_data->>'event' and gid=m.gid and added_by=m.id returning id into deleted_id;
 if deleted_id is null then raise exception 'Event not found or you are not its creator.';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.doin_delete_event(text,jsonb) from public;
grant execute on function public.doin_delete_event(text,jsonb) to anon,authenticated;
commit;
