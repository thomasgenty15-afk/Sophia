// ⟳ 2026-09-11 (chantier premier jet) — LE FAUX CLIENT TOLÈRE UNE TABLE ABSENTE.
// Le lot A a ajouté une TROISIÈME lecture au chargeur (les faux amis FR/EN).
// `composition.json` est le référentiel FIGÉ de l'enquête: il ne la contient pas.
// ⛔ CONSÉQUENCE À DIRE: ce rejeu ne mesure donc PAS l'effet du lot A. Son impact
// est mesuré à part, hors ligne, dans `../2026-09-11-CHANTIER-PREMIER-JET/lotA-impact.json`.
import {loadCompositionIndex} from '../../supabase/functions/_shared/keel/food_composition_io.ts';
import {readDishes,readPreparations,readEnergyBoxDishes} from '../../supabase/functions/_shared/keel/plan_energy_read.ts';
import {planEnergy} from '../../supabase/functions/_shared/keel/plan_energy.ts';
import {boxEnergies} from '../../supabase/functions/_shared/keel/mouth_energy.ts';
import {parseGeneratedMeal,regramMeal} from '../../supabase/functions/_shared/keel/meal_generation.ts';
import {standardPortionOf,drawsByPreparation,applySizing,sizeDishForMouth,plateBoundsFor,clampToBounds} from '../../supabase/functions/_shared/keel/portion_sizing.ts';
import {spliceReworkableUnits} from '../../supabase/functions/_shared/keel/retry_merge.ts';
import {weighedReadyGrams} from '../../supabase/functions/_shared/keel/box_densify.ts';
import {resolveIngredients,nutrientsOf} from '../../supabase/functions/_shared/keel/food_composition.ts';
const dir=new URL('./',import.meta.url);
const read=async(n:string)=>JSON.parse(await Deno.readTextFile(new URL(n,dir)));
const refs=await read('composition.json');
const index=await loadCompositionIndex({from:(t:string)=>({select:()=>({range:async(a:number,b:number)=>({data:(refs[t]??[]).slice(a,b+1),error:null})})})} as any);
const traces=await read('traces.json');
const results:any[]=[];
for(const plan of traces.plans){
 const boxes=boxEnergies({index,dishes:readEnergyBoxDishes(plan.dishes),preparations:readPreparations(plan.preparations)});
 const energy=planEnergy({index,dishes:readDishes(plan.dishes),preparations:readPreparations(plan.preparations),servings:1,addons:[],mealsOutByDay:new Map()});
 const name=plan.id.startsWith('5fad')?'perte':'gain';const sizing=await read(name+'-sizing.json');
 const table=plan.dishes.map((d:any,i:number)=>{const b=boxes.find(x=>x.boxId===d.boxes[0]?.id);const s=sizing.rows[i];return {day:d.day,slot:d.slot,title:d.title,engineTarget:s.target_kcal,engineExpectedG:s.person_cooked_g,engineDensity:s.density,reportKcal:energy.dishes[i].kcal,boxKcal:b?.kcal,boxG:b?.grams,boxDensity:b?.kcal&&b?.grams?100*b.kcal/b.grams:null,gap:b?.gap,uses:d.uses};});
 results.push({name,final:table});console.log(name,JSON.stringify(table));
}
await Deno.writeTextFile(new URL('results.json',dir),JSON.stringify(results,null,2));
const stages:any[]=[];
for(const [name,start,member,targets] of [
 ['perte',1,'55e2eaa4-522e-4f93-ba1c-469c1496564f',{breakfast:613.5,lunch:981.6,dinner:858.9}],
 ['gain',7,'c0fe63e9-3944-4ede-a48d-6fa7a3cdfda6',{breakfast:728,lunch:1164.8,dinner:1019.2}],
] as const){
 const args:any={doctrine:null,safetyConstraints:[],mode:'to_shop',scope:'week',pantry:[],beliefKeys:[],eatingRhythm:[],soloBoxes:false,standardRecipe:true,cookOnlyDay:null,daysToFill:['fri','sat','sun'],awayDays:[],cookingTimeMin:60,recipeDifficulty:'easy',variety:'balanced',kitchenEquipment:[],composition:index,fixedIntakes:[],dayProperties:[],merge:null,boxMemberIds:[member],weighedMemberIds:[member],boxMemberDiets:[],boxMemberExclusions:[]};
 let meal=parseGeneratedMeal(traces.raw[start].output_text,args);regramMeal(meal,index);
 for(let step=0;step<3;step++){
  if(step>0){
   const retry=parseGeneratedMeal(traces.raw[start+step*2].output_text,args);
   const indices=name==='perte'?(step===1?[2,4,7]:[2,4]):(step===1?[3,4,5,6]:[5]);
   const asks=indices.map(i=>({dishIndex:i,freshReworkable:true,reworkablePotIds:meal.dishes[i].uses.map(u=>u.preparationId)}));
   meal=spliceReworkableUnits({base:meal,retry,asks}).meal;
  }
  const draws=drawsByPreparation(meal.dishes);
  const measure=meal.dishes.map((d,i)=>{
   const standard=standardPortionOf({index,dish:d,uses:d.uses,preparations:meal.preparations,drawsByPrep:draws});
   const target=targets[d.slot as keyof typeof targets];
   const bounds=plateBoundsFor({ageYears:name==='perte'?36:28,slot:d.slot,slotTargetKcal:target,light:false,appetite:null});
   const sized=sizeDishForMouth({standard,targetKcal:target,bounds});
   return {i,day:d.day,slot:d.slot,title:d.title,check:d.densityCheck,standard,target,bounds,sized,bounded:clampToBounds({sized,standard,bounds})};
  });
  if(step===2){
   const logged=await read(name+'-sizing.json');
   for(const m of measure){
    const expected=logged.rows[m.i];
    if(m.standard.kcal!==expected.standard_kcal || m.standard.cookedG!==expected.standard_cooked_g || m.standard.densityPer100G!==expected.density){
     throw new Error(`Rejeu différent du journal archivé: ${name} ${m.day}/${m.slot}. Vérifier les changements de code avant de conclure.`);
    }
   }
  }
  const applied=applySizing({meal,memberId:member,index,rows:measure.map(m=>({dishIndex:m.i,factor:m.bounded.factor,sized:true}))});
  const boxes=boxEnergies({index,dishes:applied.dishes,preparations:applied.preparations});
  stages.push({name,step,measure,boxes,meal,applied});
  console.log('STAGE',name,step,JSON.stringify(measure.map(m=>({day:m.day,slot:m.slot,title:m.title,check:m.check,d:m.standard.densityPer100G,kcal:m.standard.kcal,g:m.standard.cookedG,verdict:m.sized.verdict,unmet:m.bounded.unmetKcal,expectedG:m.bounded.personCookedG}))));
 }
}
await Deno.writeTextFile(new URL('stages.json',dir),JSON.stringify(stages,null,2));
const gain=stages.find(s=>s.name==='gain'&&s.step===2);const md=gain.meal.dishes[5];const draw=drawsByPreparation(gain.meal.dishes);
const components=[{id:'fresh',ingredients:md.ingredients},...md.uses.map((u:any)=>{const p=gain.meal.preparations.find((p:any)=>p.id===u.preparationId);const n=draw.get(p.id)!;return {id:p.id,ingredients:p.ingredients.map((i:any)=>({...i,amount:typeof i.amount==='number'?i.amount/n:i.amount}))};})];
const parts=components.map(c=>({id:c.id,grams:weighedReadyGrams(c.ingredients,index),items:resolveIngredients(index,c.ingredients).resolved.map(r=>({term:r.ref.label,slug:r.ref.slug,gramsRaw:r.gramsRaw,yield:r.ref.yieldFactor,yieldClass:r.ref.yieldClass,kcal100:r.ref.energyKcal}))}));
console.log('WATER',JSON.stringify({components:parts,together:weighedReadyGrams(components.flatMap(c=>c.ingredients),index),separate:parts.reduce((n,c)=>n+(c.grams??0),0),factor:gain.measure[5].bounded.factor}));
const food:any[]=[];
for(const s of stages.filter(s=>s.step===0))for(const d of s.meal.dishes.filter((d:any)=>d.slot==='breakfast')){const resolved=resolveIngredients(index,d.ingredients);food.push({name:s.name,day:d.day,ingredients:resolved.resolved.map(r=>({term:r.ref.label,slug:r.ref.slug,gramsRaw:r.gramsRaw,kcal100:r.ref.energyKcal,source:r.ref.source}))});}
await Deno.writeTextFile(new URL('diagnostic.json',dir),JSON.stringify({water:{components:parts,together:weighedReadyGrams(components.flatMap(c=>c.ingredients),index),separate:parts.reduce((n,c)=>n+(c.grams??0),0),factor:gain.measure[5].bounded.factor},food},null,2));
const mappings=new Map();
for(const s of stages)for(const unit of [...s.meal.dishes,...s.meal.preparations])for(const ing of unit.ingredients){
 const r=resolveIngredients(index,[ing]).resolved[0];if(!r)continue;
 const original=refs.food_composition_refs.find((x:any)=>x.slug===r.ref.slug);
 mappings.set(ing.term,{term:ing.term,slug:r.ref.slug,label:r.ref.label,ciqual:original?.ciqual_name,code:original?.ciqual_code,kcal100:r.ref.energyKcal,source:r.ref.source});
}
await Deno.writeTextFile(new URL('mappings.json',dir),JSON.stringify([...mappings.values()],null,2));
// Contrefactuel local uniquement : mêmes quantités finales, fruits français
// explicitement reliés aux références fraîches déjà présentes dans cette base.
const corrected=traces.plans.map((p:any)=>structuredClone(p));
const counterfactual=[];
for(const p of corrected){
 for(const u of [...p.dishes,...p.preparations])for(const i of u.ingredients){if(['raisin','raisins'].includes(i.term))i.term='grapes';if(['prune','prunes'].includes(i.term))i.term='plum';}
 const b=boxEnergies({index,dishes:readEnergyBoxDishes(p.dishes),preparations:readPreparations(p.preparations)});
 // Les items frais portent aussi le terme : il faut la même référence des deux côtés.
 for(const d of p.dishes)for(const box of d.boxes??[])for(const it of box.items){if(['raisin','raisins'].includes(it.term))it.term='grapes';if(['prune','prunes'].includes(it.term))it.term='plum';}
 const after=boxEnergies({index,dishes:readEnergyBoxDishes(p.dishes),preparations:readPreparations(p.preparations)});
 counterfactual.push({id:p.id,boxes:after.map(x=>({day:x.day,slot:x.slot,kcal:x.kcal,grams:x.grams,gap:x.gap}))});
}
await Deno.writeTextFile(new URL('fruit-counterfactual.json',dir),JSON.stringify(counterfactual,null,2));
