import { indexDuReferentiel, ligne } from "../composer-reference.ts";
import { resolveCompositionLine } from "../../../supabase/functions/_shared/keel/food_composition.ts";
const index = await indexDuReferentiel();
for (const [t,r] of [["edamame","edamame"],["graines de courge","pumpkin_seeds"],["couscous complet","couscous_wholemeal"],["tempeh","tempeh"],["tofu","tofu"],["lentilles","lentils_cooked"],["tamari","tamari_sans_gluten"],["épinards","spinach"],["pain complet","wholemeal_bread"],["fèves de soja","edamame"]] as [string,string][]) {
  const out = resolveCompositionLine(index, ligne(t,r,100) as never);
  console.log(`${t.padEnd(20)} ref=${r.padEnd(20)} → ${out.ref?.slug ?? "NULL"}  refusé=${JSON.stringify((out as any).refRefused ?? (out as any).refused ?? null)}  clés=${Object.keys(out)}`);
}
