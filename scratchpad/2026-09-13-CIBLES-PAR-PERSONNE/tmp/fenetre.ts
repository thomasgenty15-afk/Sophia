import { cookingAskedToday, slotsUnservableToday } from "../../../supabase/functions/_shared/keel/plan_hours.ts";
import { withoutSpentFirstDay } from "../../../supabase/functions/_shared/keel/meal_plan_window.ts";
const JOURS = ["sun","mon","tue","wed","thu","fri","sat"];
const iso = Deno.args[0];
const d = new Date(iso);
const jourLocal = new Intl.DateTimeFormat("fr-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
const h = Number(new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",hour:"2-digit",hour12:false}).format(d).slice(0,2));
const slots = ["breakfast","lunch","dinner"] as const;
const passes = slotsUnservableToday({hourNow:h, rhythm:slots.map(s=>({slot:s})), declaredHours:[]});
const f = withoutSpentFirstDay({startsOn:jourLocal,durationDays:3},{
  today:jourLocal, cookOnlyDay:null, declaredSlots:[...slots],
  passedSlots:passes.passed, heldSlots:passes.heldForShopping,
  shoppingCutoffReached: !cookingAskedToday({hourNow:h}),
});
console.log(`horloge ${iso} → jour local ${jourLocal} ${h} h`);
console.log(`passés=${JSON.stringify(passes.passed)} retenus=${JSON.stringify(passes.heldForShopping)} coupure=${!cookingAskedToday({hourNow:h})}`);
console.log(`fenêtre : ${f.startsOn} + ${f.durationDays} j  (dropped=${f.dropped} cause=${f.cause})`);
for (let i=0;i<f.durationDays;i++){
  const dd = new Date(new Date(`${f.startsOn}T00:00:00Z`).getTime()+i*86400000).toISOString().slice(0,10);
  console.log(`   jour ${i}: ${dd} = ${JOURS[new Date(`${dd}T00:00:00Z`).getUTCDay()]}`);
}
