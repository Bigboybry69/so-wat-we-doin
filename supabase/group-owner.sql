begin;
alter table doin_private.groups add column if not exists created_by uuid references doin_private.members(id) on delete set null;
create or replace function public.doin_create_group(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g uuid; mid uuid; t text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 insert into doin_private.groups(name) values (doin_private.clean_text(p_data->>'group',120)) returning id into g;
 insert into doin_private.members(token_hash,gid,name) values(sha256(convert_to(t,'UTF8')),g,doin_private.clean_text(p_data->>'name',40)) returning id into mid;
 update doin_private.groups set created_by=mid where id=g;
 return jsonb_build_object('token',t,'invite',g);
end $$;


create or replace function public.doin_state(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); result jsonb;
begin
 select jsonb_build_object(
  'group',(select jsonb_build_object('id',g.id,'name',g.name,'isOwner',coalesce(g.created_by=m.id,false)) from doin_private.groups g where g.id=m.gid),
  'me',jsonb_build_object('name',m.name,'id',m.id),
  'members',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'isOwner',coalesce(x.id=(select created_by from doin_private.groups where id=m.gid),false),'canRemove',coalesce(m.id=(select created_by from doin_private.groups where id=m.gid),false) and x.id<>m.id) order by x.name,x.id),'[]'::jsonb) from doin_private.members x where x.gid=m.gid),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'url',e.url,'place',e.place,'starts',e.starts,'ends',e.ends,'category',e.category,'author',e.author,'canDelete',coalesce(e.added_by=m.id,false),'creatorKnown',e.added_by is not null,
   'responses',(select coalesce(jsonb_agg(jsonb_build_object('personId',x.id,'name',x.name,'mine',x.id=m.id,'vote',r.vote,'status',r.status,'seats',r.seats) order by x.name,x.id),'[]'::jsonb)
     from doin_private.responses r join doin_private.members x on x.id=r.member where r.event=e.id)
  ) order by e.starts,e.id),'[]'::jsonb) from doin_private.events e where e.gid=m.gid)
 ) into result;
 return result;
end $$;


create or replace function public.doin_remove_member(p_token text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m doin_private.members:=doin_private.require_member(p_token); removed uuid;
begin
 if not exists(select 1 from doin_private.groups where id=m.gid and created_by=m.id) then raise exception 'Only the group creator can remove members.';end if;
 if p_data->>'member'=m.id::text then raise exception 'The group creator cannot be removed.';end if;
 delete from doin_private.members where id::text=p_data->>'member' and gid=m.gid and id<>m.id returning id into removed;
 if removed is null then raise exception 'Member not found in this group.';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.doin_remove_member(text,jsonb) from public;
grant execute on function public.doin_remove_member(text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
