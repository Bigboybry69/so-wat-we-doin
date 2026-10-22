import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('event options persist and photos load separately only for the event group',async()=>{const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated');await db.exec(readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const migration=readFileSync(new URL('../supabase/event-extras.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 await db.exec('set role anon');const rpc=async(name,token='',data={})=>(await db.query(`select public.${name}($1,$2::jsonb) r`,[token,JSON.stringify(data)])).rows[0].r;
 const a=await rpc('doin_create_group','',{name:'Alex',group:'Crew'}),b=await rpc('doin_join','',{name:'Sam',invite:a.invite}),outside=await rpc('doin_create_group','',{name:'Outside',group:'Other'});
 const fields={title:'Career meetup',place:'Hall',starts:'2027-01-01T18:00:00Z',ends:'2027-01-01T20:00:00Z'},photo='data:image/jpeg;base64,YQ==';
 const event=await rpc('doin_add_event',a.token,{...fields,rsvpNeeded:true,freeFood:true,careerFair:true,photo});
 const state=await rpc('doin_state',b.token),saved=state.events[0];for(const key of ['rsvpNeeded','freeFood','careerFair','hasPhoto'])assert.equal(saved[key],true);assert.equal(saved.photo,undefined);assert.ok(!JSON.stringify(state).includes(photo));
 assert.equal((await rpc('doin_event_photo',b.token,{event:event.id})).photo,photo);assert.equal((await rpc('doin_event_photo',outside.token,{event:event.id})).photo,null);
 await assert.rejects(rpc('doin_event_photo','bad',{event:event.id}),/join or create/);await assert.rejects(db.query('select photo from doin_private.events'),/permission denied/);
 for(const invalid of ['https://example.com/photo.jpg','data:image/svg+xml;base64,YQ==','data:image/jpeg;base64,'+'A'.repeat(410001)])await assert.rejects(rpc('doin_add_event',a.token,{...fields,photo:invalid}),/photo_size/);
 const plain=await rpc('doin_add_event',b.token,{...fields,title:'No extras'}),plainState=(await rpc('doin_state',a.token)).events.find(e=>e.id===plain.id);for(const key of ['rsvpNeeded','freeFood','careerFair','hasPhoto'])assert.equal(plainState[key],false);
 await rpc('doin_respond',b.token,{event:event.id,vote:1,status:'maybe',seats:0});assert.equal((await rpc('doin_state',a.token)).events.find(e=>e.id===event.id).responses[0].vote,1);
 await rpc('doin_delete_event',a.token,{event:event.id});assert.equal((await rpc('doin_event_photo',b.token,{event:event.id})).photo,null);
}finally{await db.close();}});
