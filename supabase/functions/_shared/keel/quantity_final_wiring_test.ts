/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA FINALISATION DES QUANTITÉS EST BRANCHÉE APRÈS LA DERNIÈRE MUTATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI DES ÉPINGLES DE POSITION, ET PAS SEULEMENT UN BANC DE MODULE.
 * `quantity_render.ts` est pur et entièrement testé; ça ne dit RIEN de
 * l'endroit où il tourne — et l'endroit EST le lot. Le compteur
 * `prose_stale = 0` de l'ajusteur était vrai et sans valeur, parce qu'il ne
 * contrôlait que sa propre étape: la revue a dû le désarmer à la main. Une
 * finalisation posée trop tôt serait le même compteur, avec un nom de plus.
 *
 * L'ordre à tenir, et ce que chaque inversion coûterait:
 *
 *   ① APRÈS `applySizing` — c'est lui qui multiplie `amount` en laissant
 *      `quantity` intact (son propre pavé le dit). Avant, on régénérerait la
 *      prose depuis un nombre que la ligne suivante va changer.
 *   ② APRÈS la reconstruction des courses — elle réécrit `shopping_list`, et
 *      elle lit `line.quantity` pour classer une ligne « pesée » ou
 *      « comptée ». La finaliser avant lui donnerait à classer un texte que
 *      ce bloc vient d'écrire.
 *   ③ AVANT le recollage de la charge `dishes` — l'instantané pris ~2 200
 *      lignes plus haut doit recevoir la version finale, sinon le frais des
 *      plats part en base avec la quantité d'avant.
 *   ④ APPELÉE UNE SEULE FOIS. Deux appels ne se verraient pas (la fonction
 *      est idempotente), mais deux SITES finiraient par diverger.
 *
 * ⚠️ CHAQUE ÉPINGLE EST DOUBLÉE D'UNE COUPE: sans elle, ces tests seraient des
 * `indexOf` sur des chaînes qui pourraient disparaître ensemble. Précédent
 * `portion_sizing_wiring_test.ts`, mot pour mot.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const REL = "generate-household-meal-v1/index.ts";
const SRC = stripComments(await Deno.readTextFile(new URL(REL, FUNCTIONS_DIR)));

const FINAL = "const quantityFinal = finalizeQuantityProse(";
const SIZING = "const applied = applySizing({";
const SHOPPING = "const scaled = scaleShoppingList([line], f);";
const RELINK = "const sizedByBox = new Map<string, number[]>();";
const PREPS_WRITTEN = "const preparationsWritten = mealPreparationsPayload(meal);";

Deno.test("CÂBLAGE ① la finalisation existe, et une seule fois", () => {
  assertEquals(
    SRC.split(FINAL).length - 1,
    1,
    "deux sites de finalisation finiraient par diverger",
  );
  // La coupe: la fonction est bien celle du module commun, pas une copie locale.
  assert(SRC.includes('from "../_shared/keel/quantity_render.ts"'));
  assert(SRC.includes("planQuantityLines(meal.dishes, meal.preparations)"));
});

Deno.test("CÂBLAGE ② elle vient APRÈS `applySizing` et après les courses", () => {
  const f = SRC.indexOf(FINAL);
  const s = SRC.indexOf(SIZING);
  const c = SRC.indexOf(SHOPPING);
  assert(f > 0 && s > 0 && c > 0, "les trois ancres existent");
  assert(s < f, "`applySizing` multiplie `amount` sans toucher `quantity`");
  assert(c < f, "les courses sont reconstruites avant la finalisation");
});

Deno.test("CÂBLAGE ③ elle vient AVANT le recollage de la charge `dishes`", () => {
  const f = SRC.indexOf(FINAL);
  const r = SRC.indexOf(RELINK);
  const p = SRC.indexOf(PREPS_WRITTEN);
  assert(f > 0 && r > 0 && p > 0, "les trois ancres existent");
  assert(f < r, "l'instantané `dishes` doit recevoir la version finale");
  assert(f < p, "`preparations` est resérialisé après, depuis `meal`");
});

Deno.test("CÂBLAGE ④ le recollage porte bien les trois champs de quantité", () => {
  // ⛔ SANS CE RECOLLAGE, LE LOT S'ARRÊTE AUX CASSEROLES. `preparations` est
  // resérialisé depuis `meal`; `dishes` est un instantané, et c'est lui qui
  // part en base ET dans la réponse.
  for (const champ of ["entry.quantity = line.quantity;", "entry.amount = line.amount;", "entry.grams_raw = line.gramsRaw;"]) {
    assert(SRC.includes(champ), `le recollage n'écrit pas \`${champ}\``);
  }
  // Et il se compte: un recollage silencieux qui cesse de fonctionner
  // ressemblerait exactement au défaut qu'il répare.
  assert(SRC.includes("quantity_relinked: quantityRelinked"));
});

Deno.test("CÂBLAGE ⑤ les compteurs sortent, et la divergence se dit", () => {
  assert(SRC.includes('tag: "keel.household_meal.quantity_final"'));
  // ⛔ L'`issue` EST LE SEUL SIGNAL QUI SURVIVE AU JOURNAL. Non nulle, elle dit
  // qu'une prose était périmée au moment d'écrire — donc, sur un plan neuf,
  // qu'une mutation a été ajoutée APRÈS ce point.
  assert(SRC.includes("issues.push(`quantity_prose_stale:${quantityFinal.stale_before}`)"));
});

Deno.test("CÂBLAGE ⑥ la langue vient du contenu, jamais du navigateur", () => {
  // La MÊME dérivation que `reportLocale`, qui vient de `profiles.locale`.
  const f = SRC.indexOf(FINAL);
  const bloc = SRC.slice(f, f + 900);
  assert(
    bloc.includes('householdContentLocale.slice(0, 2).toLowerCase() === "fr" ? "fr" : "en"'),
    "la finalisation doit lire la locale du CONTENU",
  );
  // Le cas qui mord: rien de `navigator` ni de `Intl` résolu sur place.
  assert(!bloc.includes("navigator"));
});
