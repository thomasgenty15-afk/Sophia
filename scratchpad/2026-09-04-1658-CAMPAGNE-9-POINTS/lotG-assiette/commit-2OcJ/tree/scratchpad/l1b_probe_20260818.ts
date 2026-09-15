// L1-B — sonde de vérification. Fichier de session, non commité.
import {
  servingDirectionFor,
  servingDemandsFor,
  CHILD_DIRECTION,
  NEUTRAL_DIRECTION,
  SERVING_DIRECTION,
  MEMBER_GOALS,
} from "../supabase/functions/_shared/keel/household_portions.ts";
import { goalApplies } from "../supabase/functions/_shared/keel/household.ts";
import { GOAL_TOKENS, ACTIVITY_LEVELS } from "../supabase/functions/_shared/keel/tokens.ts";


console.log("GOAL_TOKENS      =", JSON.stringify(GOAL_TOKENS));
console.log("MEMBER_GOALS     =", JSON.stringify(MEMBER_GOALS));
console.log("ACTIVITY_LEVELS  =", JSON.stringify(ACTIVITY_LEVELS));
console.log("CHILD_DIRECTION  =", JSON.stringify(CHILD_DIRECTION));
console.log("NEUTRAL_DIRECTION=", JSON.stringify(NEUTRAL_DIRECTION));
console.log("SERVING_DIRECTION=", JSON.stringify(SERVING_DIRECTION, null, 1));

console.log("\n=== 3 objectifs x 4 etats d'age : DEUX CHEMINS SONDES SEPAREMENT ===");
const ages = ["adult", "minor", "unknown", "senior"] as const;
const goals = [...GOAL_TOKENS, null] as (string | null)[];
let divergences = 0;
for (const ageState of ages) {
  for (const goal of goals) {
    const m = { ageState, goal } as never;
    const dir = servingDirectionFor(m);
    const dem = servingDemandsFor(m);
    // Le second chemin doit etre EXACTEMENT la lecture du premier.
    const expectDem = JSON.stringify(dem);
    const label = `${ageState.padEnd(8)} goal=${String(goal).padEnd(12)} applies=${String(goalApplies(m as never)).padEnd(5)}`;
    const isChild = dir === CHILD_DIRECTION;
    const isNeutral = dir === NEUTRAL_DIRECTION;
    console.log(`${label} dir=${isChild ? "<CHILD>" : isNeutral ? "<NEUTRAL>" : dir}`);
    console.log(`${" ".repeat(label.length)} demands=${expectDem}`);
    if (ageState === "minor" && goal !== null && dir === CHILD_DIRECTION) {
      console.log("  !!! MINEUR AVEC OBJECTIF ECRASE PAR CHILD_DIRECTION");
      divergences++;
    }
  }
}
console.log("\nmineurs ecrases:", divergences, "(attendu 0)");
