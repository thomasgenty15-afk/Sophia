import {api,save} from './run.mjs';
import fs from 'node:fs';
const dir='scratchpad/2026-09-05-AUDIT-PLAN-PROD/';
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.meta.json'))){
 const m=JSON.parse(fs.readFileSync(dir+name,'utf8'));
 if(!m.request_id)continue;
 const r=await api(`/rest/v1/llm_raw_response_events?request_id=eq.${m.request_id}&user_id=eq.${m.uid}&select=*&order=created_at.asc`);
 save(m.id+'.raw.json',r);
 console.log(m.id,r.status,Array.isArray(r.data)?r.data.length:'error');
}
