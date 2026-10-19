import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=file=>readFileSync(new URL('../supabase/'+file,import.meta.url),'utf8');
test('single-use device links preserve identity, enforce limits, revoke removed members, and reset only once',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role;create schema net;create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as \'select 1::bigint\';');
  await db.exec(sql('schema.sql'));await db.exec(sql('notifications.sql'));
  for(const file of ['group-owner.sql','membership.sql','device-linking.sql']){await db.exec(sql(file));await db.exec(sql(file));}
  const rpc=async(name,token='',data={})=>(await db.query(`select public.${name}($1,$2::jsonb) as r`,[token,JSON.stringify(data)])).rows[0].r;
  const admin=async query=>{await db.exec('reset role');const result=await db.exec(query);await db.exec('set role anon');return result;};
  await db.exec('set role anon');
  const a=await rpc('doin_create_group','',{group:'Crew',name:'Alex'}),b=await rpc('doin_join','',{invite:a.invite,name:'Sam'}),c=await rpc('doin_create_group','',{group:'Other',name:'Outside'});
  const initial=await rpc('doin_state',a.token),sam=await rpc('doin_state',b.token),outside=await rpc('doin_state',c.token);
  assert.equal(initial.group.isOwner,true);assert.equal(sam.group.isOwner,false);assert.equal(initial.members.find(m=>m.id===sam.me.id).canRemove,true);assert.equal(initial.members.find(m=>m.id===initial.me.id).canRemove,false);
  assert.equal((await rpc('doin_join',a.token,{invite:a.invite,name:'Ignored'})).token,a.token);
  await assert.rejects(rpc('doin_join','',{invite:a.invite,name:' alex '}),/already in this group/);
  const event=await rpc('doin_add_event',a.token,{title:'Show',place:'Park',category:'Music',starts:'2026-11-01T18:00:00Z',ends:'2026-11-01T20:00:00Z'});
  await rpc('doin_respond',a.token,{event:event.id,vote:1,status:'going',seats:3});
  await assert.rejects(rpc('doin_create_device_link','wrong',{}),/join or create/);
  const link=await rpc('doin_create_device_link',a.token,{});assert.match(link.code,/^\d{6}$/);assert.ok(Date.parse(link.expiresAt)>Date.now()+590000);
  assert.match((await rpc('doin_create_device_link',a.token,{})).error,/Wait/);
  const linked=await rpc('doin_claim_device_link','',{code:link.code});assert.ok(linked.token);assert.notEqual(linked.token,a.token);
  const restored=await rpc('doin_state',linked.token);assert.deepEqual(restored,await rpc('doin_state',a.token));assert.equal(restored.members.length,2);assert.equal(restored.events[0].canDelete,true);assert.equal(restored.events[0].responses[0].seats,3);
  assert.match((await rpc('doin_claim_device_link','',{code:link.code})).error,/already used/);
  for(const table of ['member_credentials','device_links','link_limits'])await assert.rejects(db.query('select * from doin_private.'+table),/permission denied/);
  const expired=await rpc('doin_create_device_link',b.token,{});await admin("update doin_private.device_links set expires_at=now()-interval '1 second'");
  assert.match((await rpc('doin_claim_device_link','',{code:expired.code})).error,/expired/);
  for(let i=0;i<3;i++)assert.match((await rpc('doin_claim_device_link','',{code:'invalid'})).error,/invalid/);
  assert.match((await rpc('doin_claim_device_link','',{code:'invalid'})).error,/Too many/);
  await admin('delete from doin_private.link_limits');
  // Per-IP hints cannot bypass the application-wide failed-attempt cap.
  for(let i=0;i<30;i++) {await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-forwarded-for':'test-'+i})]);assert.match((await rpc('doin_claim_device_link','',{code:'bad'})).error,/invalid/);}
  await db.query("select set_config('request.headers','{}',false)");assert.match((await rpc('doin_claim_device_link','',{code:'bad'})).error,/Too many/);
  await admin('delete from doin_private.link_limits;delete from doin_private.device_links');
  const samLink=await rpc('doin_create_device_link',b.token,{}),samDevice=await rpc('doin_claim_device_link','',{code:samLink.code});
  const samEvent=await rpc('doin_add_event',b.token,{title:'Sam event',place:'Park',starts:'2026-11-02T18:00:00Z',ends:'2026-11-02T20:00:00Z'});
  await rpc('doin_respond',b.token,{event:event.id,vote:1,status:'going',seats:2});
  await assert.rejects(rpc('doin_remove_member',b.token,{member:initial.me.id}),/Only the group creator/);
  await assert.rejects(rpc('doin_remove_member',a.token,{member:initial.me.id}),/cannot be removed/);
  await assert.rejects(rpc('doin_remove_member',a.token,{member:outside.me.id}),/not found/);
  await rpc('doin_remove_member',linked.token,{member:sam.me.id});
  for(const token of [b.token,samDevice.token])await assert.rejects(rpc('doin_state',token),/join or create/);
  const after=await rpc('doin_state',a.token);assert.equal(after.members.length,1);assert.equal(after.events.find(e=>e.id===event.id).responses.length,1);assert.equal(after.events.find(e=>e.id===samEvent.id).creatorKnown,false);
  await admin("insert into doin_private.push_config values(true,'test-key','test-secret','https://example.supabase.co/functions/v1/notify-events',true)");
  await admin(sql('reset-requested-groups.sql'));
  await assert.rejects(rpc('doin_state',a.token),/join or create/);
  await db.exec('reset role');
  for(const table of ['groups','members','events','responses','member_credentials','device_links','push_subscriptions','push_jobs'])assert.equal((await db.query('select count(*)::int n from doin_private.'+table)).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from doin_private.push_config')).rows[0].n,1);
  await db.exec('set role anon');const fresh=await rpc('doin_create_group','',{name:'Fresh',group:'New crew'});
  await admin(sql('reset-requested-groups.sql'));assert.equal((await rpc('doin_state',fresh.token)).group.name,'New crew');
 }finally{await db.close();}
});
