import {parseGeneratedMeal} from '../../supabase/functions/_shared/keel/meal_generation.ts';
import {householdAllergyConstraints} from '../../supabase/functions/_shared/keel/household_safety.ts';
const safetyConstraints=householdAllergyConstraints([{id:'qa-allergy',memberId:'qa-child',label:'oeuf'}],'fr-FR');
const args={doctrine:{forbidden:[],foods:{recommended:[],discouraged:[]}},safetyConstraints,mode:'to_shop',scope:'day',pantry:[],beliefKeys:[],eatingRhythm:[{slot:'breakfast',size:'medium'}],daysToFill:['mon'],awayDays:[],cookingTimeMin:null,composition:null,fixedIntakes:[],dayProperties:[],merge:null,boxMemberIds:[],weighedMemberIds:[],kitchenEquipment:null,cookOnlyDay:null,soloBoxes:false,boxMemberDiets:[],boxMemberExclusions:[]};
const rows=[];
for(const term of ['oeuf','œuf','oeufs','œufs','œufs sans coquille','oeuf sans coquille','tofu']){
 const ingredient={term,quantity:'200 ml',amount:200,unit:'ml',state:'raw',group:term==='tofu'?'tofu_tempeh':'eggs'};
 const payload={dishes:[{title:term,day:'mon',slot:'breakfast',ingredients:[ingredient],method:'Verser dans un bol.',why:'Un petit-déjeuner facile.',honours_belief_keys:[],uses:[],boxes:[]}],preparations:[],cooking_sessions:[],shopping_list:[{term,quantity:'200 ml',aisle:'dairy'}]};
 const parsed=parseGeneratedMeal(payload,args as never);
 rows.push({term,expected_reject:term!=='tofu',dishes_kept:parsed.dishes.length,shopping_kept:parsed.shopping_list.length,issues:parsed.issues});
}
console.log(JSON.stringify(rows,null,2));
