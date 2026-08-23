// MESURE AVANT ③ (bis) — le balayage sur SAFETY_LEXICON, porteuse `ma soeur`.
import { SAFETY_LEXICON } from "../supabase/functions/sophia-brain/safety/safety_lexicon.ts";
import { runSafetyPregate } from "../supabase/functions/sophia-brain/safety/safety_pregate.ts";

const stamp = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
console.log(`== MESURE AVANT ③ bis · ${stamp} CEST ==`);

const verdict = (msg: string) => {
  const o = runSafetyPregate({ user_message: msg });
  return JSON.stringify({
    detected: o.detected,
    band: o.risk_band,
    third: o.disarmed.some((d) => d.condition === "third_party_referent"),
    codes: o.reason_codes,
  });
};

const eligibles = SAFETY_LEXICON.filter(
  (e) => e.lang === "fr" && e.disarmable_by.includes("third_party_referent"),
);
console.log(`  entrees FR desarmables par third_party_referent: ${eligibles.length} / ${SAFETY_LEXICON.length}`);

let premisseOk = 0, divergent = 0;
for (const e of eligibles) {
  const dig = `ma soeur ${e.probe}`;
  const lig = `ma sœur ${e.probe}`;
  const nu = e.probe;
  const vDig = verdict(dig), vLig = verdict(lig), vNu = verdict(nu);
  // PRÉMISSE: sans la porteuse, la sonde doit MORDRE; avec le digramme, elle
  // doit être DÉSARMÉE. Sinon le couple ne prouve rien.
  const premisse = vNu !== vDig;
  if (premisse) premisseOk += 1;
  const same = vDig === vLig;
  if (premisse && !same) divergent += 1;
  console.log(`  [${e.id}] premisse=${premisse ? "OK" : "--"} accord=${same ? "OUI" : "*** NON ***"}`);
  if (!same) {
    console.log(`      nu       ${nu} => ${vNu}`);
    console.log(`      digramme ${dig} => ${vDig}`);
    console.log(`      ligature ${lig} => ${vLig}`);
  }
}
console.log(`  premisse tenue: ${premisseOk}/${eligibles.length}`);
console.log(`  DIVERGENTS (premisse tenue): ${divergent}/${premisseOk}`);
console.log(`  accord: ${premisseOk - divergent}/${premisseOk} = ${premisseOk ? Math.round(100 * (premisseOk - divergent) / premisseOk) : 0}%`);
