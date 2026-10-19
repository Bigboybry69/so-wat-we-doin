// Temporary maintenance task: do not log credentials, IDs, or group contents.
import {readFileSync} from 'node:fs';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token) throw new Error('The saved Supabase maintenance credential is unavailable. Nothing was deleted.');
const response=await fetch('https://api.supabase.com/v1/projects/ecxbznnetkifbmpiudqu/database/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:readFileSync('scripts/remove-requested-event.sql','utf8')}),signal:AbortSignal.timeout(45000)});
if(!response.ok)throw new Error('Maintenance request failed (HTTP '+response.status+').');
const [result]=await response.json();
if(result?.matched!==1 || result?.deleted!==1)throw new Error('Expected exactly one matching event; no event was deleted. A more specific title or group is needed.');
console.log('Verified: exactly one requested event deleted. Related votes and queued notifications were removed by database constraints.');
