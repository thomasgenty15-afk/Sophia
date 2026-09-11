import fs from 'node:fs';
import {api,login,save} from './run.mjs';
const created=JSON.parse(fs.readFileSync('scratchpad/2026-09-05-AUDIT-PLAN-PROD/created-fixtures.json'));
const owner=await login(created.find(x=>x.label==='memory-owner').email),member=await login(created.find(x=>x.label==='memory-member').email);
const route='/functions/v1/generate-household-meal-v1';const base={operation:'compose',intent:'draft',window:{kind:'days',count:3},replaces:null};
const cases=[
 {id:'invalid-jwt',token:'not-a-token',body:base,status:401},
 {id:'secondary-cannot-compose',token:member.access_token,body:base,status:403},
 {id:'zero-days',body:{...base,window:{kind:'days',count:0}},status:400},
 {id:'eight-days',body:{...base,window:{kind:'days',count:8}},status:400},
 {id:'unreadable-window',body:{...base,window:{kind:'invalid'}},status:400},
 {id:'draft-cannot-replace',body:{...base,replaces:'00000000-0000-4000-8000-000000000000'},status:400},
 {id:'unknown-intent',body:{...base,intent:'force'},status:400},
];
const results=[];
for(const c of cases){const t=Date.now();const r=await api(route,{token:c.token??owner.access_token,body:c.body});results.push({id:c.id,expected_status:c.status,...r,ms:Date.now()-t,verdict:r.status===c.status?'PASS':'FAIL'});}
save('guard-probes.json',results);console.log(results.map(r=>({id:r.id,http:r.status,verdict:r.verdict})));
