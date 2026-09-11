import fs from 'node:fs';
import {api,login,save} from './run.mjs';
const dir='scratchpad/2026-09-05-AUDIT-PLAN-PROD';
for(const name of fs.readdirSync(dir).filter(x=>x.endsWith('.meta.json'))){
 const m=JSON.parse(fs.readFileSync(dir+'/'+name));
 const usage=await api(`/rest/v1/llm_usage_events?user_id=eq.${m.uid}&created_at=gte.${encodeURIComponent(m.start)}&created_at=lte.${encodeURIComponent(m.end)}&select=request_id,source,provider,model,status,latency_ms,prompt_tokens,output_tokens,cost_usd,metadata&order=created_at.asc`);
 if(usage.status!==200)throw Error(JSON.stringify(usage));save(m.id+'.usage.json',usage.data);
 const prior=JSON.parse(fs.readFileSync(dir+'/'+m.id+'.fixture.json'));
 if(!prior.profile?.length){
 const profile=await api(`/rest/v1/profiles?id=eq.${m.uid}&select=id,full_name,birth_date,gender,height_cm,activity_level,timezone,locale`);
 const goal=await api(`/rest/v1/student_goals?user_id=eq.${m.uid}&select=*`);
 save(m.id+'.fixture.json',{...prior,profile:profile.data,goal:goal.data,snapshot_timing:'AFTER run; initial service read was filtered by RLS, corrected opaque apikey header'});
 }
}
console.log('Collected completed runs; private data restricted to tested QA user IDs.');
