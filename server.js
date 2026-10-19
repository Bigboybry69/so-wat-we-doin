import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
mkdirSync(process.env.DATA_DIR || '.data', { recursive: true });
const db = new DatabaseSync(resolve(process.env.DATA_DIR || '.data', 'plans.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (token TEXT PRIMARY KEY, gid TEXT REFERENCES groups(id), name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, gid TEXT REFERENCES groups(id), title TEXT, url TEXT, place TEXT, starts TEXT, ends TEXT, category TEXT, author TEXT);
CREATE TABLE IF NOT EXISTS responses (event TEXT REFERENCES events(id), member TEXT REFERENCES members(token), vote INTEGER, status TEXT, seats INTEGER DEFAULT 0, PRIMARY KEY(event,member));`);
if(!db.prepare('PRAGMA table_info(events)').all().some(column=>column.name==='added_by')) db.exec('ALTER TABLE events ADD COLUMN added_by TEXT');
const id = () => randomBytes(24).toString('base64url');
const fail = (message, status=400) => { throw Object.assign(new Error(message), {status}); };
const str = (v,max=120) => typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : fail('Please check the required fields.');
async function body(req) { let raw=''; for await (const chunk of req) { raw+=chunk; if(raw.length>16000) fail('Request too large.',413); } try { return JSON.parse(raw); } catch { fail('Invalid JSON.'); } }
const publicDir=resolve('public');
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try {
 if(url.pathname.startsWith('/api/')) {
  if(req.method==='POST' && url.pathname==='/api/groups') { const b=await body(req), gid=id(),token=id(); db.prepare('INSERT INTO groups VALUES (?,?)').run(gid,str(b.group),); db.prepare('INSERT INTO members VALUES (?,?,?)').run(token,gid,str(b.name,40)); return send({token,invite:gid},201); }
  if(req.method==='POST' && url.pathname==='/api/join') {const b=await body(req); if(!db.prepare('SELECT id FROM groups WHERE id=?').get(b.invite)) fail('That invite was not found.',404); const token=id();db.prepare('INSERT INTO members VALUES (?,?,?)').run(token,b.invite,str(b.name,40));return send({token,invite:b.invite},201);}
  const member=db.prepare('SELECT * FROM members WHERE token=?').get(req.headers.authorization?.replace(/^Bearer /,'' )||''); if(!member) fail('Please join or create a group.',401);
  const creatorHash=createHash('sha256').update(member.token).digest('hex');
  if(req.method==='POST' && url.pathname==='/api/group') { const b=await body(req), name=str(b.name); db.prepare('UPDATE groups SET name=? WHERE id=?').run(name,member.gid); return send({id:member.gid,name}); }
  if(req.method==='GET' && url.pathname==='/api/state') {
   const group=db.prepare('SELECT * FROM groups WHERE id=?').get(member.gid);
   const members=db.prepare('SELECT rowid AS id,name,token FROM members WHERE gid=?').all(member.gid);
   const events=db.prepare('SELECT * FROM events WHERE gid=? ORDER BY starts').all(member.gid).map(e=>{const {added_by,...event}=e;return {...event,canDelete:added_by===creatorHash,creatorKnown:Boolean(added_by),responses:db.prepare('SELECT r.*,m.rowid AS personId,m.name FROM responses r JOIN members m ON r.member=m.token WHERE event=?').all(e.id).map(r=>({name:r.name,personId:r.personId,mine:r.member===member.token,vote:r.vote,status:r.status,seats:r.seats}))};});
   return send({group,me:{name:member.name,id:members.find(m=>m.token===member.token).id},members:members.map(({id,name})=>({id,name})),events});
  }
  if(req.method==='POST' && url.pathname==='/api/events') { const b=await body(req);const starts=str(b.starts),ends=str(b.ends);if(!Number.isFinite(Date.parse(starts))||!Number.isFinite(Date.parse(ends))||Date.parse(ends)<=Date.parse(starts)) fail('End time must be after start time.');let link='';if(b.url){try{const u=new URL(b.url);if(!['http:','https:'].includes(u.protocol)) fail('Use a website link.');link=u.href;}catch{fail('Enter a valid website link.');}}const eid=id();db.prepare('INSERT INTO events (id,gid,title,url,place,starts,ends,category,author,added_by) VALUES (?,?,?,?,?,?,?,?,?,?)').run(eid,member.gid,str(b.title),link,str(b.place),starts,ends,['Music','Food','Outdoors','Arts','Hangout'].includes(b.category)?b.category:'Hangout',member.name,creatorHash);return send({id:eid},201); }
  if(req.method==='POST' && url.pathname==='/api/deleteEvent') {const b=await body(req);if(!db.prepare('SELECT id FROM events WHERE id=? AND gid=? AND added_by=?').get(b.event,member.gid,creatorHash)) fail('Event not found or you are not its creator.',403);db.exec('BEGIN');try{db.prepare('DELETE FROM responses WHERE event=?').run(b.event);db.prepare('DELETE FROM events WHERE id=? AND gid=? AND added_by=?').run(b.event,member.gid,creatorHash);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send({ok:true});}
  if(req.method==='POST' && url.pathname==='/api/respond') { const b=await body(req);if(!db.prepare('SELECT id FROM events WHERE id=? AND gid=?').get(b.event,member.gid)) fail('Event not found.',404);if(![0,1].includes(b.vote)||!['going','maybe','out'].includes(b.status)||!Number.isInteger(b.seats)||b.seats<0||b.seats>8) fail('Invalid response.');db.prepare('INSERT INTO responses VALUES (?,?,?,?,?) ON CONFLICT(event,member) DO UPDATE SET vote=excluded.vote,status=excluded.status,seats=excluded.seats').run(b.event,member.token,b.vote,b.status,b.status==='going'?b.seats:0);return send({ok:true}); }
  fail('Not found.',404);
 }
 if(!['GET','HEAD'].includes(req.method)) fail('Method not allowed.',405);
 const path=resolve(publicDir,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(publicDir+'/')) fail('Not found.',404);
 let data;try{data=readFileSync(path);}catch{fail('Not found.',404);}
 res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(req.method==='HEAD'?undefined:data);
 } catch(e){send({error:e.status?e.message:'Something went wrong. Please try again.'},e.status||500);}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Plans running on port ${process.env.PORT||3000}`));
