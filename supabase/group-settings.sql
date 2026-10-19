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
