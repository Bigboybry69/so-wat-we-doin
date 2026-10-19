// Uses the existing repository secret without logging credentials or application data.
import {readFileSync} from 'node:fs';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw new Error('The Supabase setup token is missing.');
for(const file of ['group-owner.sql','membership.sql','device-linking.sql','reset-requested-groups.sql']) {
 const response=await fetch('https://api.supabase.com/v1/projects/ecxbznnetkifbmpiudqu/database/query',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({query:readFileSync('supabase/'+file,'utf8')}),signal:AbortSignal.timeout(45000)
 });
 if(!response.ok)throw new Error('Database update '+file+' failed (HTTP '+response.status+').');
 console.log('Applied '+file);
}
console.log('Device linking and group owner controls installed; requested one-time reset completed.');
