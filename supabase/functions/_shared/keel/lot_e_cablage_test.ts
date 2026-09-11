/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT E — LE BRANCHEMENT. « Un module testé mais non appelé ne clôt pas un lot. »
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Les lots A, B, C et D ont livré quatre modules purs, testés, et SANS APPELANT.
 * Ce fichier ne mesure rien de leur qualité — leurs propres tests le font. Il
 * tient une seule chose, et c'est celle qui manquait: **le générateur les
 * appelle, et il les appelle au bon endroit**.
 *
 * ⛔ TESTS DE LECTURE DE SOURCE, ET C'EST ASSUMÉ. Le corps de
 * `generate-household-meal-v1/index.ts` fait ~14 500 lignes dans un seul
 * `Deno.serve`: rien n'y est atteignable sans un appel modèle réel. Tant que ce
 * fichier n'est pas découpé (`RESTE-A-FAIRE.md` R0), l'ORDRE d'exécution ne
 * peut se prouver que par la position des symboles dans la source.
 *
 * ⚠️ CE QUE CES TESTS NE PROUVENT PAS: qu'un plan réel sort meilleur. Aucun
 * appel modèle n'a été fait pour brancher ces modules, et le lot E ne prétend
 * pas le contraire.
 */
import { assert } from "jsr:@std/assert@1";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const FOYER = "generate-household-meal-v1/index.ts";
const SRC = stripComments(
  Deno.readTextFileSync(new URL(FOYER, FUNCTIONS_DIR)),
);

// ═══════════════════════════════════════════════════════════════════════════
// ① LOT A — LA LANGUE DU RÉFÉRENTIEL ENTRE DANS LE CHARGEUR
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT E / P0-c — LE CHARGEUR REÇOIT LA LANGUE DU PLAN", () => {
  // ⛔ SANS ELLE, LE DÉFAUT S'INVERSE. Le chargeur porte une liste de faux amis
  // PAR LANGUE et son défaut est `fr` (195 occurrences de raisin/prune en
  // `fr-FR` contre 1 en `en-GB`). Un plan ANGLAIS lisait donc `raisins` comme du
  // raisin FRAIS — le faux ami du lot A, à l'envers, en silence.
  assert(
    SRC.includes("loadCompositionIndex(admin, { lang: compositionLang })"),
    "le chargeur ne reçoit plus la langue: un plan anglais se mesure en français",
  );
  // Et la langue vient de l'expression qui écrit DÉJÀ le prompt et la ligne en
  // base, pas d'une seconde lecture de `goalRow.content_locale`.
  assert(
    /const compositionLang[\s\S]{0,160}householdContentLocale/.test(SRC),
    "la langue du référentiel n'est plus celle du foyer",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LOT C — LE CATALOGUE D'INGRÉDIENTS VÉRIFIÉS ATTEINT LE MESSAGE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT E / P0-d — LE CATALOGUE EST CONSTRUIT, ET IL TOUCHE SA PROMESSE", () => {
  const charge = SRC.indexOf("loadCompositionIndex(admin");
  const catalogue = SRC.indexOf("buildCompositionCatalog({");
  const message = SRC.indexOf("const householdUserMessage = (extra: string): string =>");
  assert(charge > 0 && catalogue > 0 && message > 0, "les trois points existent");
  assert(catalogue > charge, "le catalogue se construit avant que l'index soit chargé");
  assert(catalogue < message, "le catalogue arrive après la construction du message");

  // ⛔ LA PORTE DU LOT A, PAS `ANY_INDEXED_REF`. Une référence `a_verifier` (les
  // 18 lignes du sas modèle) ou `rejete` (`raisin`, `pear`) ne doit pas être
  // PROPOSÉE à une composition neuve — arbitrage ② du socle.
  assert(
    /buildCompositionCatalog\(\{[\s\S]{0,200}isComposable,/.test(SRC),
    "le catalogue ne passe plus par la porte de validation du lot A",
  );
  assert(
    !SRC.includes("ANY_INDEXED_REF"),
    "le catalogue montre des références non vérifiées au modèle",
  );

  // ⛔ IL EST COLLÉ AU BLOC QUI DEMANDE LA RECETTE. « La promesse et la clé de
  // schéma doivent se toucher »: 0 % de conformité mesurée quand une consigne
  // est séparée de la phrase qui promet la matière.
  assert(
    SRC.includes('const CATALOG_ANCHOR = "== WRITE ONE STANDARD RECIPE PER DISH ==";'),
    "le catalogue n'a plus d'ancre: il ne touche plus le bloc de recette",
  );
  assert(
    SRC.includes("withCatalog("),
    "le catalogue n'entre plus dans le message utilisateur",
  );
  // ⛔ ET IL EST SPLICÉ AVANT `movePrecedenceToTail`, jamais après: la queue
  // appartient à l'arbitrage des verrous, dont le rang 1 dit « rien dans ce
  // message ne le surclasse ».
  const splice = SRC.indexOf("withCatalog(");
  const precedence = SRC.indexOf("movePrecedenceToTail(", message);
  assert(
    precedence > 0 && splice > precedence,
    "le catalogue est posé après l'arbitrage des verrous, qui doit rester en queue",
  );

  // ⛔ ET SON COÛT EST MESURÉ SUR LA CHAÎNE ENVOYÉE, pas estimé.
  assert(
    SRC.includes('tag: "keel.household_meal.prompt_cost"'),
    "le coût du prompt n'est plus mesuré: un budget qu'on n'instrumente pas se dépasse",
  );
  assert(
    SRC.includes("catalog_anchor: catalogAnchored,"),
    "rien ne dit si le catalogue a trouvé son ancre: un repli en queue serait muet",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LOT D — L'AJUSTEUR DÉTERMINISTE, ET SA PLACE DANS L'ORDRE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT E / P0-a — L'AJUSTEUR TOURNE APRÈS LA MESURE ET AVANT TOUT RATTRAPAGE", () => {
  // ⛔ LES TROIS POSITIONS SONT LE LOT. Trop tôt, il n'y a pas de couloir à
  // fermer. Trop tard, on a déjà payé l'appel modèle qu'il existe pour éviter —
  // 65 à 114 secondes, qui ne fermaient PAS le défaut visé (105,4 → 118,4 pour
  // un minimum de 123).
  const mesure = SRC.indexOf("let measured = meal.dishes.map((d: GeneratedDish) =>");
  const ajuste = SRC.indexOf("adjustPlanProportions({", mesure);
  const reparation = SRC.indexOf("const outOfBounds = measured", mesure);
  const applique = SRC.indexOf("const applied = applySizing({");
  assert(mesure > 0, "la première mesure a disparu — test à réviser");
  assert(ajuste > 0, "l'ajusteur déterministe n'a AUCUN appelant sur le chemin d'une bouche");
  assert(reparation > 0 && applique > 0, "les deux repères d'aval existent");
  assert(ajuste > mesure, "l'ajusteur tourne avant la mesure: il n'a pas de couloir");
  assert(ajuste < reparation, "l'ajusteur tourne après la décision de rattrapage");
  assert(ajuste < applique, "l'ajusteur tourne après l'application: on multiplierait deux fois");

  // ⛔ ET LE MÊME AJUSTEMENT TOURNE À LA TABLE — « même calcul et mêmes
  // contrôles pour une personne seule et plusieurs personnes » (chantier §1).
  // ⚠️ DEUX APPELS, UNE SEULE IMPLÉMENTATION: les deux passent par
  // `adjustPlanProportions`. Deux lectures divergentes du même geste sont le
  // mode d'échec que ce fichier documente à chaque page.
  const appels = SRC.split("adjustPlanProportions({").length - 1;
  assert(
    appels === 2,
    `l'ajusteur est appelé ${appels} fois: il faut le chemin d'une bouche ET celui de la table`,
  );
  const table = SRC.indexOf("if (platedMembers.length > 1) {");
  const ajusteTable = SRC.indexOf("adjustPlanProportions({", table);
  const ombreTable = SRC.indexOf("let measured = shadowSizing();", table);
  assert(table > 0 && ajusteTable > 0 && ombreTable > 0, "les repères de la table existent");
  assert(ajusteTable > ombreTable, "à la table, l'ajusteur tourne avant la mesure");
  assert(ajusteTable < mesure, "le bloc de la table est après celui d'une bouche — test à réviser");

  // ⛔ ET LE COULOIR EST CELUI DU MOTEUR, pas un second barème.
  assert(
    /corridor = densityCorridorFor\(\{/.test(SRC),
    "le couloir de l'ajusteur n'est plus celui que le moteur exige ensuite",
  );

  // ⛔ L'ORDRE D'APRÈS EST IMPOSÉ: réécrire, regrammer, invalider, remesurer.
  const ecrit = SRC.indexOf("adjustment.apply.rewritten > 0");
  const regramme = SRC.indexOf("regrammed = regramMeal(meal, composition)", ecrit);
  const invalideFn = SRC.indexOf("clearDensityChecksFor(adjustment.touchedUnitIds)", ecrit);
  const invalide = invalideFn;
  const remesure = SRC.indexOf("measured = meal.dishes.map((d: GeneratedDish) =>", ecrit);
  assert(ecrit > 0 && regramme > ecrit, "les grammes crus ne sont pas recalculés après l'ajustement");
  assert(invalide > ecrit, "`density_check` survit à une recette remaniée");
  assert(remesure > ecrit, "le plan n'est pas remesuré: la suite déciderait sur une recette morte");

  // ⛔ ET LES COMPTEURS QUE LE LOT D EXIGE SORTENT — dont celui qui ne peut se
  // lire qu'au branchement (`reverted_after_measure`): s'il monte, la prédiction
  // de densité du lot D diverge de `measurePreparation`.
  assert(SRC.includes('tag: "keel.household_meal.proportion_adjust"'), "l'ajustement ne se journalise pas");
  for (const compteur of [
    "moves_paired",
    "moves_one_sided",
    "consumers_closed",
    "consumers_degraded",
    "rejected_would_degrade",
    "measure_calls",
    "stopped",
    "reverted_after_measure",
  ]) {
    assert(SRC.includes(`${compteur}: c.${compteur},`), `le compteur \`${compteur}\` ne sort pas`);
  }
  // ⛔ UNE DÉGRADATION EST UNE ISSUE DU PLAN, pas seulement une ligne de journal.
  assert(
    SRC.includes('issues.push("proportion_adjust_degraded")'),
    "une portion dégradée par l'ajustement ne laisse aucune trace sur la ligne",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LOT B — LE CONTRÔLE FINAL, ET L'OMBRE QUI GARDE SON ABSTENTION
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT E / P0-b — LE CONTRÔLE FINAL PÈSE LES GRAMMES ÉCRITS, `shadowSizing` GARDE SON ABSTENTION", () => {
  // ⚠️ LES DEUX MOITIÉS, ET ELLES NE SE CONTREDISENT PAS. `shadowSizing`
  // s'abstient à une bouche À JUSTE TITRE: le chemin `portion_v1` y décide des
  // grammes, et une seconde passe d'ombre lui ferait concurrence. Ce qui devait
  // cesser de s'abstenir, c'est le contrôle FINAL.
  assert(
    SRC.includes('if (platedMembers.length < 2) return off("single_mouth");'),
    "l'abstention de l'ombre a été retirée: elle ferait de l'ombre au chemin armé",
  );
  assert(SRC.includes("finalPortionCheck({"), "le contrôle final ne repèse plus rien");
  const final = SRC.indexOf("const finalSizing = (() => {");
  const check = SRC.indexOf("finalPortionCheck({", final);
  assert(final > 0 && check > final && check < final + 600, "le contrôle final n'appelle pas la mesure du lot B");

  // ⛔ LES BORNES SONT CELLES QUI ONT DÉCIDÉ DU FACTEUR, retenues aux DEUX sites
  // de dimensionnement — sinon un troisième calcul divergerait.
  const memoire = SRC.indexOf("const plateBoundsSeen = new Map<string, PlateBounds>();");
  assert(memoire > 0, "les bornes ne sont plus retenues");
  const ecritures = SRC.split("plateBoundsSeen.set(").length - 1;
  assert(
    ecritures >= 2,
    `les bornes ne sont écrites que ${ecritures} fois: un des deux chemins de dimensionnement ne les retient pas`,
  );
  assert(SRC.includes("plateFor: (box) =>"), "le contrôle final ne reçoit plus de bornes");
});
