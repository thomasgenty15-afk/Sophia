/**
 * PASSE TRANSVERSE — RED NEUF : l'ÉNONCÉ LITTÉRAL « ce n'était pas prévu » n'est
 * pas un marqueur de hors-plan.
 *
 * Trouvé en construisant le décor: le tour « Last night we ended up getting
 * pizza, it wasn't on the plan at all » a écrit `protocol_events.plan_relation
 * = NULL` (relu en psql). Le lexique de FF-009 ne capte que des CIRCONSTANCES
 * (commandé, takeaway, resto, cantine, mariage) — jamais la phrase par laquelle
 * l'élève DIT lui-même que le repas sortait du plan.
 *
 * Méthode: le texte est soumis DIRECTEMENT au plancher (FF-029/FF-011/FF-018),
 * ce qui contourne `PILOT_FORCED_LOCALE` et rend le résultat valable en FR.
 */
import { detectDeclaredMeal } from "../supabase/functions/_shared/keel/meal_declaration_floor.ts";

const CASES: Array<{ text: string; locale: string; note: string }> = [
  { text: "I had a pizza for dinner, it wasn't on the plan at all.", locale: "en-GB", note: "énoncé littéral EN" },
  { text: "I ate a pizza last night. That wasn't on the plan.", locale: "en-GB", note: "énoncé littéral EN, 2 phrases" },
  { text: "I had a burger for lunch, off plan I know.", locale: "en-GB", note: "« off plan » mot pour mot" },
  { text: "I had chocolate at four, nothing to do with the plan.", locale: "en-GB", note: "paraphrase EN" },
  { text: "J'ai mangé une pizza hier soir, ce n'était pas prévu.", locale: "fr-FR", note: "énoncé littéral FR" },
  { text: "J'ai mangé un burger à midi, c'était hors plan.", locale: "fr-FR", note: "« hors plan » mot pour mot" },
  { text: "J'ai grignoté du chocolat, rien à voir avec le plan.", locale: "fr-FR", note: "paraphrase FR" },
  // Les TÉMOINS: le lexique mord bien sur les circonstances.
  { text: "I had a takeaway pizza for dinner.", locale: "en-GB", note: "témoin: takeaway" },
  { text: "J'ai mangé au restaurant à midi.", locale: "fr-FR", note: "témoin: au restaurant" },
];

let missed = 0;
for (const c of CASES) {
  const hit = detectDeclaredMeal(c.text, c.locale);
  const rel = hit?.planRelation ?? null;
  const isWitness = c.note.startsWith("témoin");
  const bad = !isWitness && rel !== "off_plan";
  if (bad) missed++;
  console.log(
    `${bad ? "🔴" : "  "} plan_relation=${String(rel).padEnd(8)} ` +
      `gate=${String(hit?.gate ?? "-").padEnd(22)} ` +
      `marqueur=${String(hit?.offPlanMatched ?? "-").padEnd(14)} ` +
      `[${c.note}] « ${c.text} »`,
  );
}
console.log(
  `\n${missed}/${CASES.filter((c) => !c.note.startsWith("témoin")).length} ` +
    `énoncés littéraux ne rendent PAS off_plan`,
);
