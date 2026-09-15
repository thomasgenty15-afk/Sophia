/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ C2 (2026-09-12) — L'ARRONDI EST BRANCHÉ, ET IL EST BRANCHÉ AU BON ENDROIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI DES ÉPINGLES DE POSITION EN PLUS DU BANC DE MODULE.
 * `roundQuantityLines` est pur et son banc a dix-sept épreuves; ça ne dit RIEN
 * de l'endroit où il tourne — et l'endroit EST le lot. Le plan l'écrit en
 * toutes lettres: « appliquer l'arrondi APRÈS le dimensionnement et les
 * changements de proportions », puis « recalculer ensuite les calories,
 * protéines, masses et densités, puis les courses et la prose DEPUIS CETTE
 * VERSION ». Un arrondi posé trop tôt serait un compteur vrai et sans valeur,
 * exactement comme le `prose_stale = 0` de l'ajusteur que la revue a dû
 * désarmer à la main.
 *
 * L'ordre à tenir, et ce que chaque inversion coûterait:
 *
 *   ① APRÈS `applySizing` / `applySizingForEaters` — ils multiplient `amount`,
 *      et c'est cette multiplication qui fabrique `2,13 morceaux de poulet`.
 *   ② APRÈS la CROISSANCE et le RÉTRÉCISSEMENT des casseroles — ils
 *      remultiplient les mêmes lignes; arrondir avant recréerait des fractions
 *      derrière l'arrondi, c'est-à-dire l'aller-retour que le plan interdit.
 *   ③ AVANT `finalPortionCheck` — sinon la mesure finale juge un plan qui
 *      n'est pas celui qu'on écrit.
 *   ④ AVANT la reconstruction des courses — « les courses depuis cette
 *      version ».
 *   ⑤ AVANT `finalizeQuantityProse` — la prose se dérive de la donnée
 *      arrondie, jamais l'inverse.
 *   ⑥ SUIVI DE `regramMeal` — l'arrondi remet `gramsRaw` à `null`, et
 *      `preparationReadyGrams` rend `null` dès qu'UN ingrédient n'en a pas.
 *
 * ⚠️ CHAQUE ÉPINGLE EST DOUBLÉE D'UNE COUPE, sinon ces tests seraient des
 * `indexOf` sur des chaînes qui pourraient disparaître ensemble. Précédent
 * `quantity_final_wiring_test.ts`, mot pour mot.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE. Un `grep` naïf
 * trouverait ses propres ancres dans les pavés qui les expliquent, et le test
 * resterait vert sur du code mort (`caller-audit-must-strip-comments`).
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const REL = "generate-household-meal-v1/index.ts";
const SRC = stripComments(await Deno.readTextFile(new URL(REL, FUNCTIONS_DIR)));

const ROUND = "const quantityRounding = (() => {";
const ROUND_CALL = "const rounded = roundQuantityLines(";
const SIZING_EATERS = "const appliedN = applySizingForEaters({";
const SIZING_SOLO = "const applied = applySizing({";
const POT_GROWTH = "const grown = scaleIngredients(";
const POT_SHRINK = "const shrunk = scaleIngredients(prep.ingredients, v.factor);";
const FINAL_CHECK = "const check = finalPortionCheck({";
// ⟳ 2026-09-12 · C3 — L'ANCRE DES COURSES A CHANGÉ DE NATURE. La liste ne
// suit plus un FACTEUR (`scaleShoppingList([line], f)`), qui exigeait deux
// classifications de prose d'accord entre elles: elle est RECONSTRUITE depuis
// le plan final arrondi, par identité alimentaire.
const SHOPPING = "const rebuilt = rebuildShoppingQuantities({";
const PROSE = "const quantityFinal = finalizeQuantityProse(";

Deno.test("CÂBLAGE ① l'arrondi existe, une seule fois, et c'est CELUI du module", () => {
  assertEquals(
    SRC.split(ROUND).length - 1,
    1,
    "deux sites d'arrondi finiraient par diverger",
  );
  assertEquals(SRC.split(ROUND_CALL).length - 1, 1);
  // La coupe: la fonction vient du module commun — celui que le navigateur
  // importe aussi — et pas d'une copie locale.
  assert(SRC.includes('from "../_shared/keel/quantity_render.ts"'));
  assert(SRC.includes("roundQuantityLines,"));
  assert(
    SRC.includes("roundQuantityLines(\n        planQuantityLines(meal.dishes, meal.preparations),"),
    "l'arrondi doit voir les DEUX ensembles: plats ET casseroles",
  );
});

Deno.test("CÂBLAGE ② il vient APRÈS le dimensionnement et après les casseroles", () => {
  const r = SRC.indexOf(ROUND);
  const e = SRC.indexOf(SIZING_EATERS);
  const s = SRC.indexOf(SIZING_SOLO);
  const g = SRC.indexOf(POT_GROWTH);
  const k = SRC.indexOf(POT_SHRINK);
  assert(r > 0 && e > 0 && s > 0 && g > 0 && k > 0, "les cinq ancres existent");
  assert(e < r, "`applySizingForEaters` multiplie `amount` avant l'arrondi");
  assert(s < r, "`applySizing` multiplie `amount` avant l'arrondi");
  assert(g < r, "la CROISSANCE des casseroles précède l'arrondi");
  assert(k < r, "le RÉTRÉCISSEMENT des casseroles précède l'arrondi");
});

Deno.test("CÂBLAGE ③ il vient AVANT la mesure, les courses et la prose", () => {
  const r = SRC.indexOf(ROUND);
  const c = SRC.indexOf(FINAL_CHECK);
  const a = SRC.indexOf(SHOPPING);
  const p = SRC.indexOf(PROSE);
  assert(r > 0 && c > 0 && a > 0 && p > 0, "les quatre ancres existent");
  assert(r < c, "`finalPortionCheck` doit juger le plan ARRONDI");
  assert(r < a, "les courses se reconstruisent depuis la version arrondie");
  assert(r < p, "la prose se dérive de la donnée arrondie, jamais l'inverse");
});

Deno.test("CÂBLAGE ④ `regramMeal` suit l'arrondi, dans le même bloc", () => {
  const r = SRC.indexOf(ROUND);
  const bloc = SRC.slice(r, SRC.indexOf(FINAL_CHECK));
  assert(
    bloc.includes("regramMeal(meal, composition)"),
    "sans regrammage, toute casserole touchée devient immesurable",
  );
  // La coupe: le regrammage est CONDITIONNÉ au fait que quelque chose a bougé,
  // donc un arrondi désarmé ne peut pas se cacher derrière un regrammage qui
  // tourne quand même.
  assert(bloc.includes("rounded.counts.rounded > 0"));
});

Deno.test("CÂBLAGE ⑤ le poids d'une pièce vient du RÉSOLVEUR DE PRODUCTION", () => {
  const r = SRC.indexOf(ROUND);
  const bloc = SRC.slice(r, SRC.indexOf(FINAL_CHECK));
  assert(
    bloc.includes("resolveCompositionLine(composition, {"),
    "le cas zéro doit passer par le résolveur du lot A, pas par un second",
  );
  assert(bloc.includes(".ref?.unitGrams ?? null"));
  // ⛔ LE CAS QUI MORD: aucune liste d'aliments écrite à la main. Le dépôt a
  // mesuré 12 faux positifs sur 12 avec un matcher artisanal; une liste de
  // « citron, œuf, cube de bouillon » serait exactement ça.
  for (const mot of ["citron", "lemon", "egg", "stock_cube", "œuf"]) {
    assert(!bloc.includes(mot), `liste d'aliments écrite à la main: « ${mot} »`);
  }
});

Deno.test("CÂBLAGE ⑥ les défauts partent à la réparation, ils ne disparaissent pas", () => {
  // « Si l'arrondi donne zéro à un ingrédient nécessaire: ne pas le supprimer
  // silencieusement… sinon rendre le cas à la réparation. »
  assert(SRC.includes("issues.push(`quantity_rounds_to_zero:${rounded.zeroed.length}`)"));
  // « Contrôler leur somme face au lot disponible. »
  assert(SRC.includes("issues.push(`rounding_pot_overdrawn:${potsOverdrawn}`)"));
  // La coupe: le contrôle de somme lit bien les grammes des CONTENANTS contre
  // la masse REGRAMMÉE de la casserole, et pas deux fois la même grandeur.
  const r = SRC.indexOf(ROUND);
  const bloc = SRC.slice(r, SRC.indexOf(FINAL_CHECK));
  assert(
    bloc.includes("measurePreparation(composition, {"),
    "la masse de la casserole doit venir de la MÊME fonction que les grammes des contenants",
  );
  assert(!bloc.includes("preparationReadyGrams("), "deux bases de mesure dans un même contrôle");
  assert(bloc.includes("potsUnmeasurable++"), "« je ne sais pas » n'est pas « ça va »");
  // ⛔ ET LE CONTREFACTUEL, DANS LE MÊME RUN. « Journaliser le contrefactuel,
  // pas deux runs »: la masse d'AVANT l'arrondi est relevée avec la MÊME
  // fonction, avant d'y toucher, et le même contrôle tourne dessus. Sans lui,
  // `pots_overdrawn: 2` se lirait « l'arrondi casse les casseroles » — et c'est
  // faux: mesuré le 2026-09-12 sur le cas GAIN, `before` vaut 2 aussi.
  assert(bloc.includes("const potReadyBefore = new Map<string, number | null>();"));
  assert(bloc.indexOf("potReadyBefore.set(") < bloc.indexOf("const rounded = roundQuantityLines("));
  assert(SRC.includes("pots_overdrawn_before: potsOverdrawnBefore"));
  assert(SRC.includes("pots_overdrawn_worst_per_mille: overdrawnWorstPerMille"));
});

Deno.test("CÂBLAGE ⑦ les compteurs sortent au journal ET dans la ligne écrite", () => {
  assert(SRC.includes('tag: "keel.household_meal.quantity_rounding"'));
  // ⛔ ET DANS `generated_from`: C0 a mesuré que le journal du moteur ne vit
  // que dans `/tmp/keel-serve.log` (addendum § A7-D). Un ménage de `/tmp`
  // emporterait la seule preuve que l'arrondi a tourné.
  assertEquals(
    SRC.split("quantity_rounding: quantityRounding").length - 1,
    2,
    "la trace ET l'archive, pas l'une des deux",
  );
  assert(SRC.includes("quantity_final: quantityFinal,"));
});

Deno.test("CÂBLAGE ⑧ le recollage de la charge porte l'UNITÉ, pas seulement le nombre", () => {
  // ⛔ L'ARRONDI DÉPLACE `unit` (cuillère → ml, pièce → g). Sans cette ligne,
  // la charge servie porterait `amount: 12` sous `unit: "tbsp"` — quinze fois
  // la quantité calculée, avec une prose juste par-dessus.
  for (
    const champ of [
      "entry.quantity = line.quantity;",
      "entry.amount = line.amount;",
      "entry.unit = line.unit;",
      "entry.grams_raw = line.gramsRaw;",
    ]
  ) {
    assert(SRC.includes(champ), `le recollage n'écrit pas \`${champ}\``);
  }
  // La coupe: la comparaison qui décide de ne RIEN faire lit aussi l'unité,
  // sinon une ligne dont seule l'unité a bougé serait sautée en silence.
  assert(SRC.includes("entry.unit === line.unit && entry.grams_raw === line.gramsRaw"));
});

Deno.test("CÂBLAGE ⑨ il n'y a PLUS DEUX classifications à tenir d'accord", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · C3 — CE TEST A CHANGÉ DE FORME PARCE QUE LE DÉFAUT A
  //                DISPARU, PAS PARCE QU'IL EST DEVENU GÊNANT.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QU'IL GARDAIT. C2 avait dû réaccorder DEUX lectures de prose:
  // `demandByTerm` classait un ingrédient par son `unit`, une expression
  // régulière classait la ligne de courses par son texte, et les courses
  // suivaient le rapport `après / avant` DANS UNE CLASSE. L'arrondi convertit
  // « 0,77 c. à s. » en « 12 ml »: l'huile changeait de classe entre les deux
  // relevés, `après` valait zéro, et **la ligne d'huile était supprimée**.
  // Le test épinglait donc que les deux classifications lisaient le monde de
  // la même façon.
  //
  // ⛔ CE QU'IL GARDE MAINTENANT: qu'IL N'Y EN A PLUS QU'UNE. C3 ne suit plus
  // de rapport — il RECALCULE le besoin depuis le plan final, par identité
  // alimentaire, avec `resolveIngredients`. Une ligne ne peut plus changer de
  // classe entre deux relevés parce qu'il n'y a plus ni classe ni relevé.
  // Le plan de clôture l'exige en toutes lettres: « ne pas laisser deux
  // classifications divergentes derrière ».
  assert(!SRC.includes("const demandByTerm ="), "le rapport de demande par terme est revenu");
  assert(!SRC.includes("scaleShoppingList("), "les courses suivent de nouveau un facteur");
  assert(
    !SRC.includes("ml|tbsp|tsp|tablespoons?|teaspoons?|cuill"),
    "une SECONDE classification de la ligne de courses, par son texte, est revenue",
  );
  // LE CAS QUI PASSE: la reconstruction existe, elle part du plan final, et
  // elle passe par le résolveur commun — pas par une lecture de prose.
  assert(SRC.includes("const rebuilt = rebuildShoppingQuantities({"));
  assert(SRC.includes('from "../_shared/keel/shopping_rebuild.ts"'));
  assert(
    SRC.includes("const { needs, identityByTerm } = shoppingNeedsOf({"),
    "le besoin n'est pas relevé sur le plan final",
  );
});
