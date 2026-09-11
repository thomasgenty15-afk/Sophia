/**
 * ══════════════════════════════════════════════════════════════════════════
 * SONDE DU LOT C — combien des 64 lignes divergentes se ferment, et où
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE ÉCRITURE. Elle lit les deux plans figés du lot
 * 0, en prend une COPIE PROFONDE, applique `finalizeQuantityProse` — la
 * fonction de production que le handler appelle — puis rejoue sur la copie le
 * contrôle ⑨ de l'instrument du lot 0 (`censusDesQuantites`), sans en toucher
 * une ligne. Les fixtures restent intactes à l'octet.
 *
 * ⛔ LE DÉNOMINATEUR EST CELUI DU LOT 0, PAS UN NOUVEAU. « 64 lignes sur 96 »
 * a une définition précise et étrangère à ce lot: le modèle a écrit un couple
 * (`amount`, `quantity`) cohérent, le payload persisté porte un `amount`
 * DIFFÉRENT, et la MÊME `quantity` caractère pour caractère. Mesurer avec ma
 * propre définition serait mesurer avec mon propre instrument.
 *
 * ⚠️ CE QU'ELLE NE PROUVE PAS: que le handler appelle bien cette fonction (le
 * test de câblage le fait), ni qu'un plan NEUF sorte propre (il faudrait un
 * tir réel, interdit à ce lot), ni rien du goût.
 *
 * deno run --allow-read scratchpad/2026-09-11-FIABILITE-RECETTES/sonde-lot-C.ts
 */

import { chargerFixtures, censusDesQuantites } from "../../scripts/2026-09-11-mesure-grille.ts";
import {
  finalizeQuantityProse,
  planQuantityLines,
  renderQuantity,
} from "../../supabase/functions/_shared/keel/quantity_render.ts";

// ⚠️ `decodeURIComponent`: le dépôt vit dans « Sophia 2 », et `.pathname`
// rend l'espace en `%20` — que `Deno.readTextFile` ne décode pas.
const RACINE = decodeURIComponent(new URL("./fixtures", import.meta.url).pathname);

type Ligne = { quantity: string | null; amount?: number | null; unit?: string | null };
type Bloc = { ingredients?: Ligne[] | null };

function brutePour(
  echanges: Record<string, unknown>[],
  requestId: string,
): Record<string, unknown> | null {
  const e = echanges.find(
    (x) => String(x.request_id) === requestId &&
      String(x.source) === "generate-household-meal-v1" &&
      String(x.outcome) === "text" && typeof x.output_text === "string",
  );
  if (!e) return null;
  try {
    return JSON.parse(String(e.output_text));
  } catch {
    return null;
  }
}

const fx = await chargerFixtures(RACINE);
const L: string[] = [];
const p = (s = "") => L.push(s);

p("╔══════════════════════════════════════════════════════════════════════════╗");
p("║ SONDE LOT C — la quantité affichée contre la quantité calculée           ║");
p("╚══════════════════════════════════════════════════════════════════════════╝");
p();

let perimeesAvant = 0;
let perimeesApres = 0;

for (const plan of fx.plans) {
  // ⚠️ LE `request_id` VIENT DU CONTEXTE FIGÉ, comme dans l'instrument du lot 0
  // (`const requestId = String(ctx.request_id)`). `generated_from` ne le porte
  // pas, et le lire là rendrait zéro ligne rapprochée — en silence.
  const ctx = fx.contextes.find((c) => String(c.plan_id) === String(plan.id));
  const requestId = String(ctx?.request_id ?? "");
  const brute = brutePour(fx.echanges, requestId);
  const nom = String(plan.id).slice(0, 8);
  const locale = String(plan.content_locale ?? "").slice(0, 2).toLowerCase() === "fr"
    ? "fr" as const
    : "en" as const;

  const avant = censusDesQuantites(plan, brute);
  // ⛔ COPIE PROFONDE: la fixture chargée en mémoire sert aussi au « avant ».
  const copie = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
  const counts = finalizeQuantityProse(
    planQuantityLines(
      (copie.dishes ?? []) as Bloc[],
      (copie.preparations ?? []) as Bloc[],
    ),
    locale,
  );
  const apres = censusDesQuantites(copie, brute);
  perimeesAvant += avant.amountChangeProsePerimee.length;
  perimeesApres += apres.amountChangeProsePerimee.length;

  p(`── plan ${nom} · ${plan.content_locale} ──────────────────────────────────`);
  p(`   lignes rapprochées (lot 0)          ${avant.lignesRapprochees}`);
  p(`   prose PÉRIMÉE   avant → après       ${avant.amountChangeProsePerimee.length} → ${apres.amountChangeProsePerimee.length}`);
  p(`   prose réécrite  avant → après       ${avant.amountChangeProseSuivie} → ${apres.amountChangeProseSuivie}`);
  p(`   amount inchangé avant → après       ${avant.amountInchange} → ${apres.amountInchange}`);
  p();
  p(`   compteurs de la finalisation`);
  p(`     lignes vues                       ${counts.lines}`);
  p(`     divergentes AVANT cette passe     ${counts.stale_before}`);
  p(`     réécrites                         ${counts.rewritten}`);
  p(`     rendues NUES (queue perdue)       ${counts.bare}`);
  p(`     texte historique (pas de donnée)  ${counts.historic}`);
  p(`     ni donnée ni texte                ${counts.absent}`);
  p(`     unité dénombrable fractionnaire   ${counts.counted_fractional}   ← lot D`);
  if (apres.amountChangeProsePerimee.length > 0) {
    p();
    p(`   ⛔ RESTANT PÉRIMÉ :`);
    for (const e of apres.amountChangeProsePerimee) {
      p(`      ${e.unite} · ${e.ligne} : ${e.amountModele} → ${e.amountPersiste} ${e.unite_}, lit « ${e.prose} »`);
    }
  }
  p();
}

p("══ LES DEUX LIGNES NOMMÉES PAR LA REVUE ═══════════════════════════════════");
p();
for (const plan of fx.plans) {
  for (const prep of (plan.preparations ?? []) as Record<string, unknown>[]) {
    if (prep.id !== "prep_chicken" && prep.id !== "prep_lentils") continue;
    p(`── ${prep.id} (${plan.content_locale}) ──`);
    for (const l of (prep.ingredients ?? []) as Ligne[]) {
      const r = renderQuantity(l, "fr");
      p(
        `   ${String((l as { term?: string }).term ?? "?").padEnd(28)} ` +
          `amount=${String(l.amount ?? "—").slice(0, 10).padEnd(11)} ${String(l.unit ?? "—").padEnd(5)} ` +
          `AVANT « ${l.quantity} »`,
      );
      p(`   ${" ".repeat(28)} ${" ".repeat(18)}APRÈS « ${r.text} »  [${r.readState}]`);
    }
    p();
  }
}

p("══ VERDICT ════════════════════════════════════════════════════════════════");
p();
p(`   lignes à prose périmée (définition du lot 0) : ${perimeesAvant} → ${perimeesApres}`);
p(`   fermées : ${perimeesAvant - perimeesApres} / ${perimeesAvant}`);
p();
p("   ⚠️ Ce nombre décrit les deux plans ARCHIVÉS, à quantités structurées");
p("      constantes. Il ne dit rien d'un plan neuf, ni du goût, ni de la");
p("      faisabilité d'une recette : aucune n'a été cuisinée.");

console.log(L.join("\n"));
