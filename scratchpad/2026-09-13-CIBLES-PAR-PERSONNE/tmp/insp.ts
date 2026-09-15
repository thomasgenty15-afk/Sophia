const f = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const d = f.demande; const ligne = f.ligne_ecrite;
console.log("bouches:", JSON.stringify(d.bouches.map((b:any)=>({id:String(b.member_id).slice(0,8), n:b.first_name, goal:b.goal, uid:b.user_id?String(b.user_id).slice(0,8):null})),null,0));
console.log("cases_attendues_total:", d.cases_attendues_total, "par bouche:", JSON.stringify(d.cases_attendues_par_bouche));
console.log("fenetre:", JSON.stringify(d.fenetre), "instant:", JSON.stringify(d.instant));
console.log("dishes:", (ligne.dishes??[]).length, "preps:", (ligne.preparations??[]).length);
for (const dish of (ligne.dishes??[])) {
  console.log(dish.day, dish.slot, "|", String(dish.title??dish.name).slice(0,30), "|", JSON.stringify((dish.boxes??[]).map((b:any)=>({m:(b.member_ids??[]).map((x:string)=>x.slice(0,8)), g:(b.items??[]).reduce((s:number,i:any)=>s+(i.grams||0),0)}))));
}
