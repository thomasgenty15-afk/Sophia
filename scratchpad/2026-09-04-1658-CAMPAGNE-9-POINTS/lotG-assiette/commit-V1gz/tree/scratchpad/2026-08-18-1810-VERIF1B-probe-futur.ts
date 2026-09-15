import { isNextPlanItemAlive, nextPlanLifeOf } from "../supabase/functions/_shared/keel/retained_next_plan.ts";
import { parseRetainedItem } from "../supabase/functions/_shared/keel/retained_item.ts";
const c = parseRetainedItem({ kind:"craving", scope:"next_plan", subject:"household", text:"des fajitas", value:null, source:"written", at:"2026-08-19", item:"", confidence:null })!;
for (const anchor of ["2026-08-24","2026-09-07","2027-01-04","2030-01-07","2099-01-05"]) {
  console.log(anchor, "vivant le 2026-08-19 ?", isNextPlanItemAlive(c, anchor, "2026-08-19"), JSON.stringify(nextPlanLifeOf(anchor)));
}
