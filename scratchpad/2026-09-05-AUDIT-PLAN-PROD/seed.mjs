import {api,login,save} from './run.mjs';
import fs from 'node:fs';
const journal=[];
async function ok(route,opts){const r=await api(route,opts);if(r.status>=300||r.data?.ok===false)throw Error(route+' '+JSON.stringify(r));return r.data;}
const now=new Date(),today=now.toISOString().slice(0,10),stamp=Date.now().toString(36);
const rhythm=['breakfast','lunch','dinner'].map(slot=>({slot,size:'medium'}));
const cases=[];
async function make(label,pc={},tz='Europe/Paris',solo=false){
 const email=`qa-audit-plan-${stamp}-${label}@keeltest.dev`;
 const u=await ok('/auth/v1/admin/users',{body:{email,password:'1234567',email_confirm:true,user_metadata:{full_name:'Alice Audit'}}});
 journal.push({label,email,uid:u.id});save('created-fixtures.json',journal);
 const uid=u.id;
 await ok(`/rest/v1/profiles?id=eq.${uid}`,{method:'PATCH',body:{full_name:'Alice Audit',birth_date:'1988-05-12',gender:'female',height_cm:168,activity_level:'trains_some',locale:'fr-FR',country:'FR',timezone:tz,onboarding_completed:true,access_tier:'student',trial_start:now.toISOString(),trial_end:new Date(+now+14*864e5).toISOString()}});
 await ok('/rest/v1/student_goals',{body:{user_id:uid,goal:'fat_loss',target_pace_kg_per_week:0.5,target_weight_kg:62,content_locale:'fr-FR',practical_constraints:{diet_asked:true,allergy_check:{self:true,members:[]},eating_rhythm:rhythm,cooking_style:'balanced',grocery_runs:2,kitchen_equipment:['oven','stovetop','fridge','freezer'],...pc}}});
 await ok('/rest/v1/student_body_measures',{body:{user_id:uid,measured_at:now.toISOString(),local_date:today,kind:'weight',value_si:70,source:'setup',content_locale:'fr-FR'}});
 await ok('/rest/v1/coach_clients',{body:{coach_id:'00000000-0000-4000-8000-00000000d15c',student_user_id:uid,invited_email:email,status:'active',consent_granted_at:now.toISOString(),seat_state:'trial',started_at:now.toISOString()}});
 const auth=await login(email);
 const rpc=(name,body)=>ok('/rest/v1/rpc/'+name,{body,token:auth.access_token});
 let roster=[],owner=null,hh=null;
 if(!solo){
  hh=await rpc('keel_household_create',{p_name:'QA audit '+label});
  roster=await rpc('keel_household_roster',{});owner=roster.find(r=>r.user_id===uid)?.member_id;
  await rpc('keel_household_set_member_birth_date',{p_member:owner,p_birth_date:'1988-05-12'});
 }
 async function body(mid,gender='female',height=168,weight=70,activity='trains_some',appetite='average'){
  await rpc('keel_household_set_member_body',{p_member:mid,p_height_cm:height,p_weight_kg:weight,p_gender:gender,p_activity_level:activity,p_day_activity:'seated',p_sport_frequency:'1_2',p_activity_axes_asked:true,p_takes_dessert:null,p_takes_cheese:null,p_takes_bread:null,p_meal_structure_asked:false,p_appetite:appetite,p_appetite_asked:true});
 }
 if(owner)await body(owner);
 async function member(name,dob,goal='maintenance',diet=null,weight=60){
  const a=await rpc('keel_household_add_member',{p_first_name:name,p_birth_date:dob,p_goal:goal});
  await body(a.member_id,name==='Marc'?'male':'female',name==='Marc'?183:164,weight,name==='Marc'?'trains_hard':'trains_some',name==='Marc'?'large':'average');
  if(diet)await rpc('keel_household_set_member_diet',{p_member:a.member_id,p_diet:diet});
  if(goal==='muscle_gain')await rpc('keel_household_set_member_target',{p_member:a.member_id,p_target_weight_kg:90,p_pace_kg_per_week:0.3});
  return a.member_id;
 }
 const add=(id,days,extra={})=>cases.push({id,email,solo,days,...extra});
 async function retained(items,next=null,notes=null){await rpc('keel_write_retained_items',{p_expected:null,p_items:items,p_expected_next:null,p_next:next,p_expected_notes:null,p_notes:notes,p_origins:null});}
 return {uid,email,rpc,owner,member,body,add,retained,hh};
}
const item=(kind,text,subject='household',scope='durable')=>({kind,text,subject,scope,value:null,source:'written',at:today,item:'',confidence:null,quote:null});
const b=await make('budget',{cooking_style:'minimal',grocery_runs:1,budget_amount:25,kitchen_equipment:['stovetop','fridge','freezer'],cooking_days:['sun','wed']},'America/Montreal',true);
b.add('B01-budget-no-oven',7,{body:{preferences:'Une pizza cuite à la poêle, budget de 25 euros pour ces 7 jours. Je ne possède pas de four.'}});
const c=await make('opposed');const marc=await c.member('Marc','1984-09-02','muscle_gain',null,84);
await c.retained([item('food.exclude','pain complet'),item('food.exclude','lentilles',`member:${marc}`)]);
c.add('B02-opposed-multiword',7,{body:{preferences:'Des lasagnes et des lentilles pour Alice, avec une boîte adaptée pour Marc.'}});
const d=await make('minimal-five',{cooking_style:'minimal',grocery_runs:1});
const dm=await d.member('Marc','1984-09-02','muscle_gain',null,84),lea=await d.member('Lea','2010-04-18','maintenance','vegetarian',46),tom=await d.member('Tom','2012-11-20','maintenance',null,38),zoe=await d.member('Zoe','2017-06-21','maintenance',null,24);
await d.rpc('keel_household_add_allergy',{p_member:tom,p_label:'oeuf'});await d.rpc('keel_household_add_allergy',{p_member:zoe,p_label:'arachide'});
await d.retained([item('food.exclude','lentilles',`member:${dm}`)]);
d.add('B03-minimal-five-allergy',7,{body:{preferences:'Une vraie pizza vendredi soir et des cannellonis avec jambon pour les omnivores et ricotta-épinards pour Lea.'}});
const e=await make('memory-owner');const em=await e.member('Marc','1984-09-02');
const anchor=new Date(now);anchor.setUTCDate(anchor.getUTCDate()-((anchor.getUTCDay()+6)%7));
await e.retained([item('food.exclude','betterave',`member:${em}`)], [{item:item('craving','Des fajitas pour le prochain plan','household','next_plan'),anchor:anchor.toISOString().slice(0,10),written_at:now.toISOString()}]);
e.add('B04-memory-owner',3);
e.add('B05-note-allergy-child',3,{body:{draft_note:'Marc est allergique aux noix de cajou. Pour le prochain plan, je voudrais des fajitas.'}});
save('cases-extra.json',cases);
console.log(JSON.stringify({created:journal.length,cases:cases.map(x=>x.id)}));
