import {exclusionTermsFor,dishBitesExclusion} from '../../supabase/functions/_shared/keel/food_exclusion_belt.ts';
import {householdAllergyConstraints} from '../../supabase/functions/_shared/keel/household_safety.ts';
import {findMedicalConstraintViolations} from '../../supabase/functions/_shared/keel/safety_constraints.ts';
const exclusionCases:[string,string,boolean][]=[
 ['pain complet','pain complet',true],['pain complet','pain blanc',false],['pain complet','riz complet',false],
 ['lait','laitue',false],['lait','lait de vache',true],['poisson','saumon',true],['saumon','cabillaud',false],
 ['pommes de terre','pommes',false],['pommes de terre','pommes de terre',true],
 ['noix de coco','noix de cajou',false],['beurre de cacahuète','beurre doux',false],
 ['pâtes complètes','riz complet',false],['chou-fleur','chou-fleur',true],['chou-fleur','fleur de sel',false]
];
const results=[];
for(const [excluded,ingredient,expected] of exclusionCases){
 const item={kind:'food.exclude',scope:'durable',subject:'household',text:excluded,value:null,source:'written',at:'2026-09-05',item:'',confidence:null,quote:null} as const;
 const terms=exclusionTermsFor({items:[item],subject:'household'});
 const got=dishBitesExclusion({dish:{title:ingredient,method:'',ingredients:[{term:ingredient}]},uses:[],preparationById:new Map(),terms,surface:'ingredients'}).matched!==null;
 results.push({kind:'exclusion',excluded,ingredient,expected,got,verdict:got===expected?'PASS':'FAIL',tokens:terms.map(x=>x.token)});
}
const safetyCases:[string,string,boolean][]=[
 ['arachide','beurre de cacahuète',true],['oeuf','mayonnaise aux œufs',true],['lait','lait sans lactose',true],
 ['lait','laitue',false],['noix de cajou','purée de noix de cajou',true],['oeuf','tofu',false],
 ['arachide','peanut butter',true],['oeuf','egg noodles',true],['lait','whey protein',true],
];
for(const [allergy,ingredient,expected] of safetyCases){try{
 const cs=householdAllergyConstraints([{id:'qa-probe',memberId:'qa-child',label:allergy}],'fr-FR');
 const got=findMedicalConstraintViolations(ingredient,cs).length>0;
 results.push({kind:'safety',allergy,ingredient,expected,got,verdict:got===expected?'PASS':'FAIL'});
}catch(e){results.push({kind:'safety',allergy,ingredient,expected,verdict:'INCONCLUSIVE',refusal:String(e)});}}
console.log(JSON.stringify(results,null,2));
