// Only the isolated accounts CREATED BY THIS AUDIT. No existing plan replaced.
import {api,login,run,save} from './run.mjs';
import fs from 'node:fs';
const dir='scratchpad/2026-09-05-AUDIT-PLAN-PROD/';
const people=JSON.parse(fs.readFileSync(dir+'created-fixtures.json','utf8'));
const owner=people.find(p=>p.label==='memory-owner');
if(!owner?.email.startsWith('qa-audit-plan-mtopn6pa-'))throw Error('QA isolation check');
const auth=await login(owner.email);
async function snapshot(label){
 const goals=await api(`/rest/v1/student_goals?user_id=eq.${owner.uid}&select=*`);
 const roster=await api('/rest/v1/rpc/keel_household_roster',{body:{},token:auth.access_token});
 const plans=await api(`/rest/v1/student_generated_meals?user_id=eq.${owner.uid}&select=*&order=created_at.asc`);
 save(label+'.memory.json',{at:new Date().toISOString(),goals,roster,plans});
 return plans.data;
}
const before=await snapshot('C01-before-adoption');
if(!Array.isArray(before)||before.length)throw Error('Expected no pre-existing plan on this audit account');
const base={email:owner.email,days:3,body:{intent:'prepare_next',adopting_draft:true,draft_note:'Tom est allergique aux noix de cajou. Pour le prochain plan, je voudrais des fajitas.'}};
const r=await run({...base,id:'C01-adopt-memory'});
await snapshot('C01-after-adoption');
if(r.data.meal?.id){
 const validation=await api('/rest/v1/rpc/keel_validate_meal_plan',{body:{p_plan:r.data.meal.id},token:auth.access_token});
 save('C01-validation.json',validation);
 await snapshot('C01-after-validation');
}
