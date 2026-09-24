/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ LOT 1 (2026-09-12) — LA PRODUCTION DES COURSES ET LA FRONTIÈRE D'ARRONDI
 *                        SONT BRANCHÉES, ET AU BON ENDROIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI CE FICHIER EXISTE. `shopping_rebuild.ts` et `portion_boundary.ts`
 * sont purs et éprouvés ; ça ne dit RIEN de l'endroit où ils tournent. Ce dépôt
 * paie en boucle les modules « écrits, éprouvés, sans appelant de production »
 * (`NON-BRANCHE.md`), et le lot 1 en a créé deux d'un coup : un paramètre
 * `pantry` OPTIONNEL et un module de frontière sans aucun appelant. Un
 * paramètre de garde optionnel jamais passé est une garde désarmée
 * (`optional-gate-params-are-disarmed-gates`), et elle ressemble trait pour
 * trait à une garde qui marche.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE : un `grep` naïf
 * trouverait ses propres ancres dans les pavés qui les expliquent, et le test
 * resterait vert sur du code mort (`caller-audit-must-strip-comments`).
 */
import { assert } from "jsr:@std/assert@1";
import { sourceFamily } from "./source_family.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const HANDLER = stripComments(
  await sourceFamily(new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR)),
);
const PARSER = stripComments(
  await sourceFamily(new URL("_shared/keel/meal_generation.ts", FUNCTIONS_DIR)),
);

Deno.test("LOT 1 CÂBLAGE ① — le garde-manger ARRIVE à la reconstruction des courses", () => {
  // ⛔ LE PARAMÈTRE EST OPTIONNEL DANS LE MODULE. Non passé, la déduction du
  // stock ne s'applique jamais et `pantry_lines` reste à 0 sans que rien ne le
  // dise — le cas exact de `optional-gate-params-are-disarmed-gates`.
  const at = HANDLER.indexOf("rebuildShoppingQuantities({");
  assert(at > 0, "`rebuildShoppingQuantities` n'a plus d'appelant dans le handler");
  const appel = HANDLER.slice(at, at + 900);
  assert(
    /\bpantry:\s*askedPantry\b/.test(appel),
    "la reconstruction des courses ne reçoit pas `askedPantry` : la déduction du stock est désarmée",
  );
});

Deno.test("LOT 1 CÂBLAGE ② — les trois compteurs d'achat sortent, et ils ne se confondent pas", () => {
  // `model_omitted` = le modèle avait oublié, la ligne est produite quand même.
  assert(
    HANDLER.includes("shopping_model_omitted:"),
    "l'oubli du modèle n'est plus mesuré après sa réparation déterministe",
  );
  // `needs_unbought` = un INVARIANT : une synthèse a été sautée.
  assert(
    HANDLER.includes("shopping_needs_unbought:"),
    "l'invariant « tout besoin porte une ligne » n'est plus surveillé",
  );
  // `pantry_check` = présence déclarée, quantité inconnue, besoin laissé entier.
  assert(
    HANDLER.includes("shopping_pantry_check:"),
    "« stock à vérifier » ne sort nulle part",
  );
  // ⛔ ET LES TERMES AVEC LES NOMBRES. « champignons de Paris » et « blancs
  // d'œuf » sont les deux termes qui ont refusé deux plans : un compte sans nom
  // ne se relit pas.
  assert(HANDLER.includes("omitted_terms:"), "les oublis ne sont pas nommés");
  assert(HANDLER.includes("pantry_check_terms:"), "les stocks à vérifier ne sont pas nommés");
});

Deno.test("LOT 1 CÂBLAGE ③ — la frontière d'arrondi tourne APRÈS l'arrondi et AVANT le contrôle final", () => {
  const arrondi = HANDLER.indexOf("roundQuantityLines(");
  const frontiere = HANDLER.indexOf("fitPortionsToBounds({");
  const controle = HANDLER.indexOf("finalPortionCheck({");
  // ⟳ 2026-09-12 · LOT 3 — `lastIndexOf`, ET C'EST LE POINT. Il y a désormais
  // DEUX reconstructions : le SEMIS, qui produit la liste avant la datation des
  // vagues, et la REQUANTIFICATION finale, qui la réécrit depuis le plan
  // arrondi. C'est la seconde qui doit lire les grammes définitifs ; viser la
  // première ferait passer ce test pour une raison fausse.
  const courses = HANDLER.lastIndexOf("rebuildShoppingQuantities({");
  const semis = HANDLER.indexOf("rebuildShoppingQuantities({");
  assert(semis < courses, "il n'y a plus qu'une reconstruction : le semis a disparu");
  assert(frontiere > 0, "`fitPortionsToBounds` n'a AUCUN appelant de production");
  assert(arrondi > 0 && controle > 0 && courses > 0, "les trois voisins ont bougé de nom");
  // ⛔ APRÈS L'ARRONDI : c'est la SOMME des items arrondis qui franchit la
  // borne, pas un item.
  assert(
    frontiere > arrondi,
    "la frontière tourne avant l'arrondi : elle corrigerait une somme qui va encore bouger",
  );
  // ⛔ AVANT LE CONTRÔLE : sinon on publierait un verdict sur des grammes qui
  // ne sont plus ceux de la ligne.
  assert(
    frontiere < controle,
    "la frontière tourne après `finalPortionCheck` : le verdict décrirait d'autres grammes",
  );
  // ⛔ AVANT LES COURSES : l'achat se compte sur les grammes définitifs.
  assert(
    frontiere < courses,
    "la frontière tourne après la reconstruction des achats : on achèterait d'autres quantités",
  );
});

Deno.test("LOT 1 CÂBLAGE ④ — les assiettes non ramenées dans leurs bornes se DISENT", () => {
  // ⛔ « Réparer complètement ou pas du tout » n'est honnête que si le non-réparé
  // se compte. Sans cette ligne, une assiette hors bornes disparaît du rapport.
  assert(
    HANDLER.includes("portion_boundary_unfitted:"),
    "une assiette que la frontière n'a pas su ramener sort en silence",
  );
  assert(
    HANDLER.includes("keel.household_meal.portion_boundary"),
    "le journal de la frontière n'existe pas : un réglage débranché rendrait le même plan",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 § 2.4 — LES DEUX PASSES JUGENT LE **REPAS**
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("LOT 2 CÂBLAGE § 2.4 — la frontière et la mesure finale reçoivent un REPAS, pas un contenant", () => {
  // ⛔ CE QUE CE CÂBLAGE FERME. Une assiette partagée entre un plat commun et un
  // complément porte DEUX contenants au même nom, au même jour, au même moment.
  // Les deux passes doivent lire les bornes par `(bouche, jour, moment)` — la
  // clé de `plateBoundsSeen` — et non par contenant : c'est le rappel par
  // contenant qui a relevé la part commune de 216 à 225 et servi 234 g pour un
  // plancher de 225 (tir `perte-iso10`).
  assert(
    HANDLER.includes("boundsFor: (meal) =>"),
    "la frontière reçoit encore un contenant : un plat n'a pas de bornes d'assiette",
  );
  assert(
    HANDLER.includes("plateFor: (meal) =>"),
    "la mesure finale reçoit encore un contenant",
  );
  // ⛔ LA MÊME CLÉ DES DEUX CÔTÉS. Deux dérivations du même regroupement
  // divergeraient au premier cas limite, et en silence.
  assert(
    HANDLER.includes("plateBoundsKey(meal.memberId, meal.day, meal.slot)"),
    "la frontière ne lit plus les bornes du repas",
  );
  assert(
    HANDLER.includes("plateBoundsKey(meal.memberIds[0], meal.day, meal.slot)"),
    "la mesure finale ne lit plus les bornes du repas",
  );
  // ⛔ ET LA POPULATION DU LOT SORT AU JOURNAL. À zéro, le regroupement rend le
  // même plan qu'avant : sans ce nombre, on ne saurait pas laquelle des deux
  // situations on lit.
  assert(
    HANDLER.includes("multi_box_meals: check.multiBoxMeals,"),
    "les repas à plusieurs contenants ne sont comptés nulle part",
  );
});

Deno.test("LOT 1 CÂBLAGE ⑤ — le modèle n'écrit plus la liste de courses", () => {
  // ⛔ LA CLÉ DISPARAÎT DU SCHÉMA DEMANDÉ, ET LA LECTURE RESTE. Les deux, pas
  // l'une : les plans écrits avant ce lot portent encore une liste du modèle.
  assert(
    !PARSER.includes('"shopping_list": ['),
    "le schéma du prompt redemande une `shopping_list` au modèle",
  );
  assert(
    PARSER.includes("root.shopping_list"),
    "la lecture des anciennes réponses a été retirée avec la demande",
  );
});
