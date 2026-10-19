-- Applied automatically by the Setup notifications workflow. Run schema.sql first.
begin;
create table if not exists doin_private.push_config (
 singleton boolean primary key default true check(singleton), public_key text not null,
 dispatch_secret text not null, function_url text not null, enabled boolean not null default false
);
create table if not exists doin_private.push_subscriptions (
 id uuid primary key default gen_random_uuid(), member uuid not null references doin_private.members(id) on delete cascade,
 endpoint text unique not null, subscription jsonb not null
);
create table if not exists doin_private.push_jobs (
 id uuid primary key default gen_random_uuid(), event uuid not null references doin_private.events(id) on delete cascade,
 subscription uuid not null references doin_private.push_subscriptions(id) on delete cascade,
 attempts integer not null default 0, available_at timestamptz not null default now(),
 locked_until timestamptz, delivered_at timestamptz, failed boolean not null default false,
 unique(event,subscription)
);
create index if not exists doin_push_due on doin_private.push_jobs(available_at) where delivered_at is null and not failed;
alter table doin_private.push_config enable row level security;
alter table doin_private.push_subscriptions enable row level security;
alter table doin_private.push_jobs enable row level security;
revoke all on doin_private.push_config,doin_private.push_subscriptions,doin_private.push_jobs from public,anon,authenticated;
alter table doin_private.events add column if not exists added_by uuid references doin_private.members(id) on delete set null;

create or replace function public.doin_push_status(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); c doin_private.push_config;
begin
 select * into c from doin_private.push_config where singleton;
 return jsonb_build_object('ready',coalesce(c.enabled,false),'publicKey',case when c.enabled then c.public_key else null end,'subscribed',exists(select 1 from doin_private.push_subscriptions where member=m.id and endpoint=p_data->>'endpoint'));
end $$;
create or replace function public.doin_push_subscribe(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); sub jsonb:=p_data->'subscription'; endpoint_url text:=sub->>'endpoint'; existing doin_private.push_subscriptions;
begin
 if not coalesce((select enabled from doin_private.push_config where singleton),false) then raise exception 'Notifications need the one-time server setup first.';end if;
 if endpoint_url is null or length(endpoint_url)>2048 or endpoint_url !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)?push\.services\.mozilla\.com|web\.push\.apple\.com)/[^[:space:]]+$'
 or coalesce(sub->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{80,100}$' or coalesce(sub->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{20,30}$' then raise exception 'This push subscription is not supported.';end if;
 select * into existing from doin_private.push_subscriptions where push_subscriptions.endpoint=endpoint_url;
 if existing.id is not null and existing.member<>m.id and existing.subscription->'keys'<>sub->'keys' then raise exception 'Invalid subscription keys.';end if;
 if existing.id is not null and existing.member<>m.id then delete from doin_private.push_jobs where subscription=existing.id;end if;
 insert into doin_private.push_subscriptions(member,endpoint,subscription) values(m.id,endpoint_url,sub)
 on conflict(endpoint) do update set member=excluded.member,subscription=excluded.subscription;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.doin_push_unsubscribe(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token);
begin
 delete from doin_private.push_subscriptions where member=m.id and endpoint=p_data->>'endpoint';
 return jsonb_build_object('ok',true);
end $$;
create or replace function doin_private.dispatch_push() returns void
language plpgsql security definer set search_path='' as $$
declare c doin_private.push_config;
begin
 select * into c from doin_private.push_config where singleton and enabled;
 if c.singleton is null or not exists(select 1 from doin_private.push_jobs where delivered_at is null and not failed and attempts<5 and available_at<=now() and (locked_until is null or locked_until<now())) then return;end if;
 perform net.http_post(url:=c.function_url,headers:=jsonb_build_object('Content-Type','application/json','x-grid-dispatch',c.dispatch_secret),body:='{}'::jsonb,timeout_milliseconds:=5000);
 exception when others then raise warning 'Push dispatch deferred; queued notifications will retry.';
end $$;
create or replace function doin_private.queue_event_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into doin_private.push_jobs(event,subscription)
 select new.id,s.id from doin_private.push_subscriptions s join doin_private.members m on m.id=s.member
 where m.gid=new.gid and m.id is distinct from new.added_by;
 perform doin_private.dispatch_push();return new;
end $$;
drop trigger if exists doin_new_event_push on doin_private.events;
create trigger doin_new_event_push after insert on doin_private.events for each row execute function doin_private.queue_event_push();

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


-- Worker-only RPCs. Public browser keys must never be allowed to call these.
create or replace function public.doin_push_claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 with due as (select id from doin_private.push_jobs where delivered_at is null and not failed and attempts<5 and available_at<=now() and (locked_until is null or locked_until<now()) order by available_at limit 20 for update skip locked),
 claimed as (update doin_private.push_jobs j set attempts=attempts+1,locked_until=now()+interval '2 minutes' from due where j.id=due.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'attempt',j.attempts,'subscription',s.subscription,'title',g.name,'body',e.author||' added '||e.title,'event',e.id,'group',g.id)),'[]'::jsonb) into result
 from claimed j join doin_private.push_subscriptions s on s.id=j.subscription join doin_private.events e on e.id=j.event join doin_private.groups g on g.id=e.gid;
 return result;
end $$;
create or replace function public.doin_push_finish(p_id uuid,p_attempt integer,p_result text) returns void
language plpgsql security definer set search_path='' as $$
declare sub uuid;
begin
 if p_result='expired' then
  select subscription into sub from doin_private.push_jobs where id=p_id and attempts=p_attempt and delivered_at is null;
  delete from doin_private.push_subscriptions where id=sub;
 else
  update doin_private.push_jobs set delivered_at=case when p_result='sent' then now() else null end,
   failed=(p_result='permanent' or (p_result<>'sent' and attempts>=5)),locked_until=null,
   available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::integer))
  where id=p_id and attempts=p_attempt and delivered_at is null;
 end if;
end $$;
revoke all on all functions in schema doin_private from public,anon,authenticated;
revoke all on function public.doin_push_status(text,jsonb),public.doin_push_subscribe(text,jsonb),public.doin_push_unsubscribe(text,jsonb),public.doin_push_claim(),public.doin_push_finish(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.doin_push_status(text,jsonb),public.doin_push_subscribe(text,jsonb),public.doin_push_unsubscribe(text,jsonb) to anon,authenticated;
grant execute on function public.doin_push_claim(),public.doin_push_finish(uuid,integer,text) to service_role;
commit;
