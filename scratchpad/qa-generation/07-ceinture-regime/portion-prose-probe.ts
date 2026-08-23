/**
 * LA PHRASE DE TABLE EST-ELLE GARDÉE ? — mesure, pas affirmation.
 *
 * Deux questions distinctes, sur les MÊMES octets réels:
 *   ① la PROSE DU MODÈLE dans `portion_note` (avant le « — » du moteur)
 *      contient-elle des morsures de régime ? — c'est ce que MA ceinture ne
 *      couvre pas, par construction (elle refuse des appartenances, pas du
 *      texte);
 *   ② la moitié MOTEUR (après le « — ») en contenait-elle ? — c'est ce que la
 *      ceinture ferme.
 *
 *   deno run --allow-read portion-prose-probe.ts
 */
import { scanDietaryRegime } from "../../../supabase/functions/_shared/keel/dietary_regime.ts";

const THEODULE = "1fea4f51-a4e9-4066-8d09-49881ee58f38";
const LEAD = " — ";

const PLANS = [
  "one_session/run-1",
  "one_session/run-D1",
  "separate_sessions/run-1",
  "separate_sessions/run-2",
];

let modelProseBreaches = 0;
let engineClauseBreaches = 0;
let shareNoteBreaches = 0;

for (const dir of PLANS) {
  const path =
    `/Users/ahmedamara/Dev/Sophia 2/scratchpad/qa-generation/03-foyer-modes/${dir}/http-response.json`;
  const plan = JSON.parse(await Deno.readTextFile(path));
  const row = (plan.member_portions ?? []).find((p: { member_id: string }) =>
    p.member_id === THEODULE
  );
  if (!row) continue;
  const note = String(row.portion_note ?? "");
  const cut = note.indexOf(LEAD);
  const prose = cut >= 0 ? note.slice(0, cut) : note;
  const clause = cut >= 0 ? note.slice(cut + LEAD.length) : "";

  const p = scanDietaryRegime("vegan", { prose: [prose] });
  const c = scanDietaryRegime("vegan", { prose: [clause] });
  const shareNotes = (row.preparation_shares ?? []).map((
    s: { note?: string },
  ) => String(s.note ?? ""));
  const s = scanDietaryRegime("vegan", { prose: shareNotes });

  modelProseBreaches += p.breaches.length;
  engineClauseBreaches += c.breaches.length;
  shareNoteBreaches += s.breaches.length;

  console.log(`\n### ${dir}`);
  console.log(`  prose DU MODÈLE   : ${JSON.stringify(prose)}`);
  console.log(`     morsures       : ${p.breaches.map((b) => b.matchedText).join(", ") || "aucune"}`);
  console.log(`  clause DU MOTEUR  : ${JSON.stringify(clause)}`);
  console.log(`     morsures       : ${c.breaches.map((b) => b.matchedText).join(", ") || "aucune"}`);
  console.log(`  notes de part     : ${JSON.stringify(shareNotes)}`);
  console.log(`     morsures       : ${s.breaches.map((b) => b.matchedText).join(", ") || "aucune"}`);
}

console.log(`\n== TOTAUX sur ${PLANS.length} plans réels, bouche végane ==`);
console.log(`  prose du MODÈLE  : ${modelProseBreaches} morsure(s)`);
console.log(`  clause du MOTEUR : ${engineClauseBreaches} morsure(s)`);
console.log(`  notes de part    : ${shareNoteBreaches} morsure(s)`);
