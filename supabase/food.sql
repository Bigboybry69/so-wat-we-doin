begin;
create table if not exists doin_private.restaurants (
 id uuid primary key default gen_random_uuid(), gid uuid not null references doin_private.groups(id) on delete cascade,
 name text not null check(length(name) between 1 and 120), url text not null check(length(url)<=2048 and url ~* '^https?://[^[:space:]]+$'),
 added_by uuid references doin_private.members(id) on delete set null, author text not null, created_at timestamptz not null default now()
);
create index if not exists doin_restaurants_gid on doin_private.restaurants(gid,created_at);
alter table doin_private.restaurants enable row level security;
revoke all on doin_private.restaurants from public,anon,authenticated;
create or replace function public.doin_add_restaurant(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); rid uuid; link text:=btrim(coalesce(p_data->>'url',''));
begin
 if length(link)>2048 or link !~* '^https?://[^[:space:]]+$' then raise exception 'Enter a valid website link starting with https:// or http://.';end if;
 insert into doin_private.restaurants(gid,name,url,added_by,author) values(m.gid,doin_private.clean_text(p_data->>'name',120),link,m.id,m.name) returning id into rid;
 return jsonb_build_object('id',rid);
end $$;
create or replace function public.doin_delete_restaurant(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); removed uuid;
begin
 delete from doin_private.restaurants where id::text=p_data->>'restaurant' and gid=m.gid and added_by=m.id returning id into removed;
 if removed is null then raise exception 'Restaurant not found or you did not add it.';end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.doin_state(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); result jsonb;
begin
 select jsonb_build_object(
  'group',(select jsonb_build_object('id',g.id,'name',g.name,'isOwner',coalesce(g.created_by=m.id,false)) from doin_private.groups g where g.id=m.gid),
  'me',jsonb_build_object('name',m.name,'id',m.id),
  'members',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'isOwner',coalesce(x.id=(select created_by from doin_private.groups where id=m.gid),false),'canRemove',coalesce(m.id=(select created_by from doin_private.groups where id=m.gid),false) and x.id<>m.id) order by x.name,x.id),'[]'::jsonb) from doin_private.members x where x.gid=m.gid),
  'restaurants',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'url',r.url,'author',r.author,'canDelete',coalesce(r.added_by=m.id,false)) order by r.created_at desc,r.id),'[]'::jsonb) from doin_private.restaurants r where r.gid=m.gid),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'url',e.url,'place',e.place,'starts',e.starts,'ends',e.ends,'category',e.category,'author',e.author,'canDelete',coalesce(e.added_by=m.id,false),'creatorKnown',e.added_by is not null,
   'responses',(select coalesce(jsonb_agg(jsonb_build_object('personId',x.id,'name',x.name,'mine',x.id=m.id,'vote',r.vote,'status',r.status,'seats',r.seats) order by x.name,x.id),'[]'::jsonb)
     from doin_private.responses r join doin_private.members x on x.id=r.member where r.event=e.id)
  ) order by e.starts,e.id),'[]'::jsonb) from doin_private.events e where e.gid=m.gid)
 ) into result;
 return result;
end $$;


revoke all on function public.doin_add_restaurant(text,jsonb),public.doin_delete_restaurant(text,jsonb) from public;
grant execute on function public.doin_add_restaurant(text,jsonb),public.doin_delete_restaurant(text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
