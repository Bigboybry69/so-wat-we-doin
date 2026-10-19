import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const saved=JSON.parse(readFileSync('public/config.js','utf8').match(/window\.DOIN_CONFIG\s*=\s*(\{[\s\S]*\})\s*;/)?.[1] || '{}');
const supabaseUrl=process.env.SUPABASE_URL || saved.supabaseUrl || '';
const supabaseKey=process.env.SUPABASE_PUBLISHABLE_KEY || saved.supabaseKey || '';
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(supabaseUrl)) throw new Error('Set SUPABASE_URL to the HTTPS Project URL from Supabase settings.');
let validKey=supabaseKey.startsWith('sb_publishable_');
if(supabaseKey.split('.').length===3){try{validKey=JSON.parse(Buffer.from(supabaseKey.split('.')[1],'base64url').toString()).role==='anon';}catch{validKey=false;}}
if(!validKey) throw new Error('Set SUPABASE_PUBLISHABLE_KEY to a publishable key or legacy anon key. Secret/service_role keys are forbidden.');
mkdirSync('dist',{recursive:true});cpSync('public','dist',{recursive:true});
writeFileSync('dist/config.js','window.DOIN_CONFIG = '+JSON.stringify({supabaseUrl,supabaseKey})+';\n');
writeFileSync('dist/.nojekyll','');
console.log('GitHub Pages files prepared in dist/. Only public Supabase settings are included.');
