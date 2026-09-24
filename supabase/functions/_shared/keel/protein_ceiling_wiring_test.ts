/**
 * LA PASSE DU PLAFOND PROTÉIQUE EST BRANCHÉE AU BON ENDROIT — 2026-09-22.
 *
 * ⛔ POURQUOI DES ÉPINGLES DE POSITION ET PAS SEULEMENT DES TESTS DE MODULE.
 * `protein_ceiling_adjust.ts` est pur et entièrement testé; ça ne dit RIEN de
 * l'endroit où il tourne. Or l'endroit est la moitié du lot:
 *
 *   ① la passe doit s'exécuter APRÈS `adjustPlanProportions` sur les DEUX
 *      chemins. Les facteurs qu'elle lit descendent de la mesure que
 *      l'ajusteur de densité vient de rejouer; avant lui, ils décriraient une
 *      recette qu'il s'apprête à réécrire.
 *   ② elle doit précéder la garde finale — sans quoi elle réparerait un plan
 *      déjà jugé.
 *   ③ elle doit appeler `regramMeal` et `clearDensityChecksFor`, et l'appelant
 *      doit REMESURER: les portions, les boîtes et les courses descendent
 *      toutes du dimensionnement.
 *   ④ la tolérance passée doit être `PROTEIN_CEILING_TOLERANCE`, celle de la
 *      garde qui COMPTE les dépassements. Un autre seuil réparerait des
 *      journées que personne ne compte et laisserait comptées celles qu'il ne
 *      répare pas.
 *   ⑤ les trois compteurs du lot doivent atteindre `generated_from`. Un champ
 *      sans compteur est un lot désarmé qui ressemble à un lot qui marche —
 *      et un compteur sans lecteur ne vaut pas mieux.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE. Un grep naïf compte
 * les mentions en commentaire comme des appels vivants — cicatrice
 * `caller-audit-must-strip-comments`.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { sourceFamily } from "./source_family.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const REL = "generate-household-meal-v1/index.ts";
const SRC = stripComments(await sourceFamily(new URL(REL, FUNCTIONS_DIR)));

const PASS_DEF = "const runProteinCeilingPass = (";
const PASS_TABLE = 'runProteinCeilingPass(\n            "table",';
const PASS_ONE = 'runProteinCeilingPass(\n          "one_mouth",';
const ADJUST_TABLE = 'logProportionAdjust("table", adjustment,';
const ADJUST_ONE = 'logProportionAdjust("one_mouth", adjustment,';
const GATE = "finalPlanGate(asGatePlan(writePayload), gateContext)";
// ⟳ 2026-09-24 · LOT 3b — la trace est sortie de `handle` dans `traces.ts`
// (`proteinCeilingTraceOf`), corps identique. `TRACE` est l'APPEL dans
// `handle` (il porte la position : construite avant d'être écrite) ;
// `TRACE_BODY` ouvre le corps, qui doit porter la passe. Le texte de famille
// met `traces.ts` AVANT `index.ts` : lire le corps entre deux ancres de
// `handle` ne trouverait plus rien.
const TRACE = "const proteinCeilingTrace = proteinCeilingTraceOf({";
const TRACE_BODY = "export function proteinCeilingTraceOf(";
const WRITE = "unknown>).protein_ceiling =\n      proteinCeilingTrace;";

Deno.test("⟳ 2026-09-22 — LA PASSE EST ÉTEINTE: le plafond est une mesure, et la trace le dit", () => {
  const def = SRC.indexOf(PASS_DEF);
  const gate = SRC.indexOf("if (!PROTEIN_CEILING_PURSUED) {", def);
  const call = SRC.indexOf("adjustPlanProteinCeiling({", def);
  assert(def > 0 && gate > def && gate < call, "l'interrupteur précède l'appel du module");
  assert(
    SRC.slice(gate, call).includes('proteinCeilingPass = { path, ran: false, reason: "ceiling_is_a_measure" };'),
    "la trace nomme la raison",
  );
});

Deno.test("CÂBLAGE ① la passe est définie UNE FOIS et appelée sur LES DEUX chemins", () => {
  assertEquals(SRC.split(PASS_DEF).length - 1, 1, "une seconde définition ferait diverger deux lectures");
  assertEquals(SRC.split(PASS_TABLE).length - 1, 1, "le chemin de la table l'appelle une fois");
  assertEquals(SRC.split(PASS_ONE).length - 1, 1, "le chemin d'une bouche l'appelle une fois");
});

Deno.test("CÂBLAGE ② la passe suit l'ajusteur de densité, sur chaque chemin", () => {
  const dTable = SRC.indexOf(ADJUST_TABLE);
  const pTable = SRC.indexOf(PASS_TABLE);
  assert(dTable > 0 && pTable > 0, "les deux ancres de la table existent");
  assert(dTable < pTable, "à la table, le plafond doit lire une mesure déjà rejouée");

  const dOne = SRC.indexOf(ADJUST_ONE);
  const pOne = SRC.indexOf(PASS_ONE);
  assert(dOne > 0 && pOne > 0, "les deux ancres d'une bouche existent");
  assert(dOne < pOne, "à une bouche, le plafond doit lire une mesure déjà rejouée");
});

Deno.test("CÂBLAGE ③ la passe précède la garde finale", () => {
  const gate = SRC.indexOf(GATE);
  assert(gate > 0, "l'appel de la garde finale existe");
  assert(SRC.indexOf(PASS_TABLE) < gate, "la table répare avant d'être jugée");
  assert(SRC.indexOf(PASS_ONE) < gate, "une bouche répare avant d'être jugée");
});

Deno.test("CÂBLAGE ④ ce qui suit l'ajustement est appelé, pas oublié", () => {
  const def = SRC.indexOf(PASS_DEF);
  assert(def > 0);
  const body = SRC.slice(def, def + 4000);
  // ⛔ `regramMeal` FAIT AUTORITÉ sur les grammes crus. Sans lui, la ligne
  // écrite en base garderait l'ancienne masse pendant que le verdict lit la
  // nouvelle — deux lectures du même plan, et c'est celle qui survit qui serait
  // la mauvaise (cicatrice `coverage-must-be-measured-on-the-live-index`).
  assert(body.includes("regramMeal(meal, composition)"), "les grammes crus doivent être recalculés");
  // ⛔ Une recette modifiée invalide la `density_check` que le modèle avait
  // déclarée sur la recette d'AVANT.
  assert(
    body.includes("clearDensityChecksFor(pass.touchedUnitIds)"),
    "les `density_check` des plats touchés doivent être invalidés",
  );
  // ⛔ Une prose périmée est une ISSUE du plan, pas seulement une ligne de
  // journal — même traitement que `proportion_adjust_prose_stale`.
  assert(
    body.includes('issues.push("protein_ceiling_adjust_prose_stale")'),
    "une quantité restée dans le texte doit remonter en issue",
  );
});

Deno.test("CÂBLAGE ⑤ l'appelant REMESURE quand des lignes ont été réécrites", () => {
  const tableAt = SRC.indexOf(PASS_TABLE);
  const oneAt = SRC.indexOf(PASS_ONE);
  assert(tableAt > 0 && oneAt > 0);
  const afterTable = SRC.slice(tableAt, tableAt + 700);
  const afterOne = SRC.slice(oneAt, oneAt + 700);
  assert(
    afterTable.includes("if (rewritten > 0) measured = shadowSizing();"),
    "la table doit rejouer `shadowSizing`",
  );
  assert(
    afterOne.includes("measureDish(d, draws, meal.preparations ?? [])"),
    "une bouche doit rejouer `measureDish`",
  );
});

Deno.test("CÂBLAGE ⑥ la tolérance est celle de la garde, pas un littéral", () => {
  const def = SRC.indexOf(PASS_DEF);
  const body = SRC.slice(def, def + 4000);
  assert(
    body.includes("tolerance: PROTEIN_CEILING_TOLERANCE"),
    "un littéral ici réparerait un autre seuil que celui qui compte",
  );
  assert(
    SRC.includes("PROTEIN_CEILING_TOLERANCE,\n  finalGateDelivery,"),
    "la constante vient de `final_plan_gate.ts`, jamais d'une copie locale",
  );
});

Deno.test("CÂBLAGE ⑦ les trois compteurs atteignent `generated_from.protein_ceiling`", () => {
  const def = SRC.indexOf(PASS_DEF);
  const body = SRC.slice(def, def + 4000);
  for (const key of ["adjusted_mouth_days:", "moved_g:", "residual_over:"]) {
    assert(body.includes(key), `le compteur ${key} doit être rempli`);
  }
  // ⛔ ET IL DOIT ÊTRE LU. Un compteur sans lecteur ne vaut pas mieux qu'un
  // champ sans compteur.
  const trace = SRC.indexOf(TRACE);
  const write = SRC.indexOf(WRITE);
  assert(trace > 0 && write > 0, "la trace et son écriture existent");
  assert(trace < write, "la trace est construite avant d'être écrite");
  const traceStart = SRC.indexOf(TRACE_BODY);
  const traceBody = SRC.slice(traceStart, SRC.indexOf("\n}\n", traceStart));
  assert(traceStart >= 0, "le corps de la trace a disparu de `traces.ts`");
  assert(
    traceBody.includes("adjust: proteinCeilingPass"),
    "`generated_from.protein_ceiling.adjust` doit porter la passe",
  );
  // ⛔ ET AU JOURNAL AUSSI: un journal se lit pendant un run, une ligne se lit
  // après. Les deux, ou le lot n'est mesurable qu'à moitié.
  assert(
    SRC.includes('tag: "keel.household_meal.protein_ceiling_adjust"'),
    "la passe doit se journaliser",
  );
});

Deno.test("CÂBLAGE ⑧ la case SOLO est lue sur la grille du foyer, jamais supposée", () => {
  const from = SRC.indexOf("const ceilingMouthDaysFrom = (");
  assert(from > 0, "le constructeur des journées-bouche existe");
  const body = SRC.slice(from, from + 3000);
  // ⛔ `eaters.length === 1` SUR LA GRILLE: c'est la lecture la plus
  // restrictive, et la seule qui tienne quand un plat dédié porte un seul nom
  // sur une case que deux bouches partagent.
  assert(
    body.includes("householdGrid.cells.filter((c) => c.eaters.length === 1)"),
    "les cases solo viennent de la grille du foyer",
  );
  assert(body.includes("solo,"), "chaque part porte son `solo`");
  // ⛔ AUCUN `member_id` NE SORT: la clé de bouche est un RANG.
  assert(body.includes("const mouthKey = `m${rang.get(r.memberId)}`"), "la bouche est un rang");
  assert(!body.includes("mouthKey: r.memberId"), "aucun identifiant de membre en clé");
});
