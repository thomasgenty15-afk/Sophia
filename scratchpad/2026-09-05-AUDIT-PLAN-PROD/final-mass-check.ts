import {loadCompositionIndex} from '../../supabase/functions/_shared/keel/food_composition_io.ts';
import {preparationReadyGrams} from '../../supabase/functions/_shared/keel/meal_generation.ts';
const dir=new URL('./',import.meta.url),snapshot=JSON.parse(await Deno.readTextFile(new URL('composition-snapshot.json',dir)));
const index=await loadCompositionIndex({from:(table:string)=>({select:()=>({range:(a:number,b:number)=>Promise.resolve({data:snapshot[table].slice(a,b+1),error:null})})})} as never);
const results=[];
for await(const entry of Deno.readDir(dir)){
 if(!entry.name.endsWith('.response.json'))continue;
 const d=JSON.parse(await Deno.readTextFile(new URL(entry.name,dir)));if(!d.ok)continue;
 const drawn=new Map<string,number>();
 for(const dish of d.dishes??[])for(const box of dish.boxes??[])for(const item of box.items??[])if(item.preparation_id)drawn.set(item.preparation_id,(drawn.get(item.preparation_id)??0)+item.grams);
 const pots=[];
 for(const prep of d.preparations??[]){
  const ingredients=(prep.ingredients??[]).map((i:any)=>({...i,gramsRaw:i.grams_raw??null}));
  const made=preparationReadyGrams(ingredients,index),taken=drawn.get(prep.id)??0;
  pots.push({id:prep.id,title:prep.title,ready_g:made,drawn_g:taken,ratio:made?Math.round(taken/made*1000)/1000:null,over_tolerance:made!==null&&taken>made*1.1});
 }
 results.push({id:entry.name.replace('.response.json',''),reference_snapshot_at:snapshot.at,pots});
}
console.log(JSON.stringify(results,null,2));
