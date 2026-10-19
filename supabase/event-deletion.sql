-- Creator-only event deletion. Safe to repeat; existing events are preserved.
-- Events without a recorded creator cannot safely be assigned by display name.
begin;
alter table doin_private.events add column if not exists added_by uuid references doin_private.members(id) on delete set null;
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
notify pgrst, 'reload schema';
commit;
