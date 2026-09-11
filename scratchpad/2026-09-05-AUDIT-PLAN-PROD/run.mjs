import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
const root=process.cwd(), out=path.join(root,'scratchpad/2026-09-05-AUDIT-PLAN-PROD');
const env=Object.fromEntries(fs.readFileSync('supabase/.env','utf8').split('\n').filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
const base=env.SUPABASE_URL;
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('LOCAL ONLY');
const anon=env.SUPABASE_ANON_KEY, service=env.SUPABASE_SERVICE_ROLE_KEY;
export async function api(route,{body,method,token=service}={}) {
 const wire=body===undefined?undefined:JSON.stringify(body);
 const r=await new Promise((resolve,reject)=>{
  const req=http.request(base+route,{method:method??(body===undefined?'GET':'POST'),headers:{apikey:token===service?service:anon,authorization:`Bearer ${token}`,'content-type':'application/json',Prefer:'return=representation',...(wire?{'content-length':Buffer.byteLength(wire)}:{})}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,raw:Buffer.concat(chunks).toString()}));res.on('error',reject)});
  req.setTimeout(900000,()=>req.destroy(Error('QA client 900s timeout')));req.on('error',reject);req.end(wire);
 });
 let data;try{data=JSON.parse(r.raw)}catch{data={raw:r.raw}};return {status:r.status,data};
}
export async function login(email,password='1234567') {const r=await api('/auth/v1/token?grant_type=password',{body:{email,password},token:anon});if(!r.data.access_token)throw Error('login '+email+' '+r.status);return r.data;}
export function save(name,x){fs.writeFileSync(path.join(out,name),JSON.stringify(x,null,2));}
function fingerprint(){const h=crypto.createHash('sha256');function walk(d){for(const f of fs.readdirSync(d).sort()){const p=path.join(d,f);if(fs.statSync(p).isDirectory())walk(p);else if(p.endsWith('.ts')&&!p.endsWith('_test.ts'))h.update(p).update(fs.readFileSync(p));}}walk('supabase/functions/_shared');for(const f of ['generate-meal-v1','generate-household-meal-v1'])h.update(fs.readFileSync(`supabase/functions/${f}/index.ts`));return h.digest('hex');}
export async function run(c){
 if(process.env.QA_RESTART_RUNTIME==='1'){
  const restarted=spawnSync('docker',['restart','supabase_edge_runtime_Sophia_2'],{encoding:'utf8'});
  if(restarted.status!==0)throw Error('QA local runtime restart failed: '+restarted.stderr);
 }
 const auth=await login(c.email??`qa-9pts-${c.fixture}@keeltest.dev`,c.password);const uid=auth.user.id;
 const fn=c.solo||c.fixture==='solo'?'generate-meal-v1':'generate-household-meal-v1';
 const start=new Date().toISOString();
 const before=fingerprint();
 const profile=await api(`/rest/v1/profiles?id=eq.${uid}&select=id,full_name,birth_date,gender,height_cm,activity_level,timezone,locale`);
 const goal=await api(`/rest/v1/student_goals?user_id=eq.${uid}&select=*`);
 const roster=fn.includes('household')?await api('/rest/v1/rpc/keel_household_roster',{body:{},token:auth.access_token}):null;
 save(c.id+'.fixture.json',{profile:profile.data,goal:goal.data,roster:roster?.data});
 const body={...(fn.includes('household')?{operation:'compose'}:{mode:'to_shop'}),window:{kind:'days',count:c.days},intent:'draft',replaces:null,preferences:null,one_cooking_session:false,...c.body};
 save(c.id+'.request.json',body);
 console.log(JSON.stringify({event:'start',id:c.id,start,fn,days:c.days}));
 const t=performance.now();let r;
 try{r=await api('/functions/v1/'+fn,{body,token:auth.access_token})}catch(e){r={status:0,data:{error:String(e)}}}
 const seconds=(performance.now()-t)/1000;
 save(c.id+'.response.json',r.data);
 const usage=await api(`/rest/v1/llm_usage_events?user_id=eq.${uid}&created_at=gte.${encodeURIComponent(start)}&select=request_id,source,provider,model,status,latency_ms,prompt_tokens,output_tokens,cost_usd,metadata&order=created_at.asc`);
 save(c.id+'.usage.json',usage.data);
 const meta={id:c.id,uid,fn,start,end:new Date().toISOString(),http:r.status,seconds,before,after:fingerprint(),fresh_runtime:process.env.QA_RESTART_RUNTIME==='1',request_id:r.data.request_id,ok:r.data.ok,error:r.data.error};
 save(c.id+'.meta.json',meta); console.log(JSON.stringify({event:'end',...meta}));return r;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const cases=JSON.parse(fs.readFileSync(path.join(out,process.argv[2]??'cases.json'),'utf8'));for(const c of cases){if(fs.existsSync(path.join(out,c.id+'.meta.json')))continue;const r=await run(c);if(r.status===0||r.status===502||r.status===504){console.log('STOP: inspect server completion before another generation');break;}}}
