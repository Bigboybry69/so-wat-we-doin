begin;
create table if not exists doin_private.device_links (
 code_hash bytea primary key, member uuid unique not null references doin_private.members(id) on delete cascade,
 created_at timestamptz not null default now(), expires_at timestamptz not null
);
create table if not exists doin_private.link_limits (
 bucket text primary key, failed integer not null, reset_at timestamptz not null
);
alter table doin_private.device_links enable row level security;
alter table doin_private.link_limits enable row level security;
revoke all on doin_private.device_links,doin_private.link_limits from public,anon,authenticated;
create or replace function public.doin_create_device_link(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); code text; inserted integer; attempts integer:=0; expiry timestamptz:=now()+interval '10 minutes';
begin
 perform pg_advisory_xact_lock(hashtext(m.id::text),81713);
 if exists(select 1 from doin_private.device_links where member=m.id and created_at>now()-interval '10 seconds') then return jsonb_build_object('error','Wait a few seconds before generating another code.');end if;
 delete from doin_private.device_links where expires_at<=now() or member=m.id;
 loop
  attempts:=attempts+1;
  code:=lpad(((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint)%1000000)::text,6,'0');
  insert into doin_private.device_links(code_hash,member,expires_at) values(sha256(convert_to(code,'UTF8')),m.id,expiry) on conflict do nothing;
  get diagnostics inserted=row_count;
  exit when inserted=1;
  if attempts>=10 then raise exception 'Could not generate a linking code. Try again.';end if;
 end loop;
 return jsonb_build_object('code',code,'expiresAt',expiry);
end $$;
create or replace function public.doin_claim_device_link(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare mid uuid; t text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 ip_key text:='ip:'||encode(sha256(convert_to(coalesce((coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb)->>'x-forwarded-for','unknown'),'UTF8')),'hex');
 key text;
begin
 -- An application-wide limit supplements the IP hint, which is not trusted as identity.
 -- Return errors as JSON so failed-attempt counters are committed, not rolled back.
 perform pg_advisory_xact_lock(81713,90216);
 if exists(select 1 from doin_private.link_limits where bucket='global' and failed>=30 and reset_at>now())
 or exists(select 1 from doin_private.link_limits where bucket=ip_key and failed>=5 and reset_at>now()) then
  return jsonb_build_object('error','Too many incorrect linking codes. Try again in 15 minutes.');
 end if;
 if coalesce(p_data->>'code','') ~ '^[0-9]{6}$' then
  delete from doin_private.device_links where code_hash=sha256(convert_to(p_data->>'code','UTF8')) and expires_at>now() returning member into mid;
 end if;
 if mid is null then
  foreach key in array array['global',ip_key] loop
   insert into doin_private.link_limits(bucket,failed,reset_at) values(key,1,now()+interval '15 minutes')
   on conflict(bucket) do update set failed=case when doin_private.link_limits.reset_at<=now() then 1 else doin_private.link_limits.failed+1 end,
    reset_at=case when doin_private.link_limits.reset_at<=now() then now()+interval '15 minutes' else doin_private.link_limits.reset_at end;
  end loop;
  return jsonb_build_object('error','That code is invalid, expired, or already used. Generate a new code on your signed-in device.');
 end if;
 insert into doin_private.member_credentials(token_hash,member) values(sha256(convert_to(t,'UTF8')),mid);
 return jsonb_build_object('token',t);
end $$;
revoke all on function public.doin_create_device_link(text,jsonb),public.doin_claim_device_link(text,jsonb) from public;
grant execute on function public.doin_create_device_link(text,jsonb),public.doin_claim_device_link(text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
