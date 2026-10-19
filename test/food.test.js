import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('restaurants are shared only with group members, validate links, and can be removed only by their contributor',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated');
  await db.exec(readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  const migration=readFileSync(new URL('../supabase/food.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
  await db.exec('set role anon');const rpc=async(name,token='',data={})=>(await db.query(`select public.${name}($1,$2::jsonb) r`,[token,JSON.stringify(data)])).rows[0].r;
  const a=await rpc('doin_create_group','',{name:'Alex',group:'Crew'}),b=await rpc('doin_join','',{name:'Sam',invite:a.invite}),c=await rpc('doin_create_group','',{name:'Outside',group:'Other'});
  await assert.rejects(rpc('doin_add_restaurant','bad',{name:'Cafe',url:'https://example.com'}),/join or create/);
  for(const url of ['javascript:alert(1)','data:text/html,hello','','https://bad link'])await assert.rejects(rpc('doin_add_restaurant',a.token,{name:'Cafe',url}),/valid website link/);
  await assert.rejects(rpc('doin_add_restaurant',a.token,{name:' ',url:'https://example.com'}),/required fields/);
  const first=await rpc('doin_add_restaurant',a.token,{name:'Cafe <script>',url:'https://example.com/menu?food=1&view=2'});
  const second=await rpc('doin_add_restaurant',b.token,{name:'Tacos',url:'https://maps.example.com/tacos'});
  const owner=await rpc('doin_state',a.token),friend=await rpc('doin_state',b.token);
  assert.equal(owner.group.isOwner,true);assert.equal(owner.restaurants.length,2);assert.equal(owner.events.length,0);assert.equal(friend.restaurants.length,2);
  assert.equal(owner.restaurants.find(r=>r.id===first.id).canDelete,true);assert.equal(friend.restaurants.find(r=>r.id===first.id).canDelete,false);assert.equal(friend.restaurants.find(r=>r.id===first.id).name,'Cafe <script>');
  assert.deepEqual((await rpc('doin_state',c.token)).restaurants,[]);
  await assert.rejects(db.query('select * from doin_private.restaurants'),/permission denied/);
  await assert.rejects(rpc('doin_delete_restaurant',b.token,{restaurant:first.id}),/did not add/);
  await assert.rejects(rpc('doin_delete_restaurant',c.token,{restaurant:first.id}),/did not add/);
  const code=await rpc('doin_create_device_link',a.token),linked=await rpc('doin_claim_device_link','',{code:code.code});
  await rpc('doin_delete_restaurant',linked.token,{restaurant:first.id});assert.equal((await rpc('doin_state',b.token)).restaurants.length,1);
  await rpc('doin_remove_member',a.token,{member:friend.me.id});const remaining=(await rpc('doin_state',a.token)).restaurants;assert.equal(remaining[0].id,second.id);assert.equal(remaining[0].canDelete,false);
 }finally{await db.close();}
});
