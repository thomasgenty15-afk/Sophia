import fs from 'node:fs';
import {api,login,save} from './run.mjs';
const dir='scratchpad/2026-09-05-AUDIT-PLAN-PROD';
const fixtures=JSON.parse(fs.readFileSync(dir+'/created-fixtures.json'));
const owner=fixtures.find(x=>x.label==='memory-owner');
const auth=await login(owner.email);
async function ok(route,opts){const r=await api(route,opts);if(r.status>=300||r.data?.ok===false)throw Error(route+' '+JSON.stringify(r));return r.data;}
const rpc=(name,body)=>ok('/rest/v1/rpc/'+name,{body,token:auth.access_token});
const roster=await rpc('keel_household_roster',{}),marc=roster.find(x=>x.first_name==='Marc');
const email=owner.email.replace('memory-owner','memory-member');
const account=await ok('/auth/v1/admin/users',{body:{email,password:'1234567',email_confirm:true,user_metadata:{full_name:'Marc Audit'}}});
fixtures.push({label:'memory-member',email,uid:account.id});save('created-fixtures.json',fixtures);
await ok(`/rest/v1/profiles?id=eq.${account.id}`,{method:'PATCH',body:{full_name:'Marc Audit',birth_date:'1984-09-02',gender:'male',height_cm:180,activity_level:'trains_some',locale:'fr-FR',country:'FR',timezone:'Europe/Paris',onboarding_completed:true}});
const now=new Date(),anchor=new Date();anchor.setUTCDate(anchor.getUTCDate()-((anchor.getUTCDay()+6)%7));
const item=(kind,text,scope)=>({kind,text,scope,subject:`member:${marc.member_id}`,value:null,source:'written',at:now.toISOString().slice(0,10),item:'',confidence:null,quote:null});
await ok('/rest/v1/student_goals',{body:{user_id:account.id,goal:'maintenance',content_locale:'fr-FR',practical_constraints:{retained_items:[item('food.exclude','courgettes','durable')],retained_next_plan:[{item:item('craving','Un rougail de saucisses','next_plan'),anchor:anchor.toISOString().slice(0,10),written_at:now.toISOString()}]}}});
// Fixture linkage only: no invitation or email is sent; this changes only a newly-created QA member.
await ok(`/rest/v1/household_members?member_id=eq.${marc.member_id}`,{method:'PATCH',body:{user_id:account.id}});
const tom=await rpc('keel_household_add_member',{p_first_name:'Tom',p_birth_date:'2015-05-10',p_goal:'maintenance'});
await rpc('keel_household_set_member_body',{p_member:tom.member_id,p_height_cm:145,p_weight_kg:35,p_gender:'male',p_activity_level:'trains_some',p_day_activity:'on_feet',p_sport_frequency:'1_2',p_activity_axes_asked:true,p_takes_dessert:null,p_takes_cheese:null,p_takes_bread:null,p_meal_structure_asked:false,p_appetite:'average',p_appetite_asked:true});
const cases=JSON.parse(fs.readFileSync(dir+'/cases-extra.json'));
cases.find(x=>x.id==='B05-note-allergy-child').body.draft_note='Tom est allergique aux noix de cajou. Pour le prochain plan, je voudrais des fajitas.';
save('cases-extra.json',cases);
save('memory-sentinel.json',{owner:owner.uid,member:account.id,member_id:marc.member_id,child_id:tom.member_id,expected:{owner:'fajitas + Marc excludes betterave',member:'Marc excludes courgettes + rougail next plan',note:'Tom cashew allergy must reach household safety, not merely preference'}});
console.log('Isolated account-linked memory sentinel and child ready.');
