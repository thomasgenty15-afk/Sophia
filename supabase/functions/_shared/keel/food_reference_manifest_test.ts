/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT A — L'IDENTITÉ DE L'ALIMENT, ET CE QUE LE RÉFÉRENTIEL VAUT (2026-09-11)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Chantier: `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/CHANTIER.md` § Lot A.
 * Preuves:  `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/lotA-audit.json`.
 * Migration: `20260911040000_le_referentiel_dit_ce_qu_il_vaut_...sql`.
 *
 * ── LES TROIS DÉFAUTS QUE CE FICHIER TIENT ────────────────────────────────
 *   ① `raisin` et `prune` écrits en FRANÇAIS tombaient sur les slugs ANGLAIS
 *      du fruit SEC (321 et 229 kcal) au lieu du fruit frais (68,9 et 46).
 *      `bySlug` gagnant toujours, aucun alias ne pouvait les corriger.
 *   ② `pear` portait le code 20039, le nom « Poireau, cru » et les CINQ
 *      macronutriments du poireau. 96 occurrences de `poire`/`poires` dans les
 *      plans de cette base se calculaient en poireau.
 *   ③ Rien ne distinguait « cette ligne vient de CIQUAL » de « on peut
 *      composer avec ». Le manifeste sépare les deux.
 *
 * ⛔ ET UN QUATRIÈME CAS, QUI N'EN EST PAS UN: une ligne `source = 'ciqual'`
 * SANS `ciqual_code` reste `verifie`. 689 des 881 lignes CIQUAL sont dans ce
 * cas; les durcir supprimerait les trois quarts du référentiel. Le test qui
 * l'épingle est là pour que personne ne « resserre » la règle sans mesurer.
 *
 * PURE: aucune base, aucun appel de modèle. L'index est construit à la main.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
  resolveIngredient,
  resolveIngredients,
} from "./food_composition.ts";
import {
  defaultValidationFor,
  isComposable,
  unverifiedSlugs,
  validationOf,
} from "./food_reference_manifest.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "other_fruit",
    label: over.slug,
    source: "ciqual",
    energyKcal: 100,
    proteinG: 1,
    carbsG: 10,
    fatG: 0.5,
    fiberG: 2,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  };
}

// Les sept lignes réelles du défaut, valeurs de la base locale du 2026-09-11.
const GRAPES = ref({
  slug: "grapes",
  label: "Grapes",
  ciqualCode: "13112",
  ciqualName: "Raisin, cru",
  energyKcal: 68.9,
});
const RAISINS = ref({
  slug: "raisins",
  label: "Raisins",
  ciqualCode: "13046",
  ciqualName: "Raisin, sec",
  energyKcal: 321,
});
/**
 * ⚠️ LA LIGNE `raisin` EXISTE VRAIMENT, et c'est elle le faux ami. Doublon de
 * fait de `raisins` (cinq macronutriments identiques) SANS `ciqual_code`, dont
 * le SLUG est le mot français du raisin FRAIS. La migration la marque `rejete`.
 */
const RAISIN_SLUG = ref({
  slug: "raisin",
  label: "Raisin",
  energyKcal: 321,
  validation: "rejete",
});
const PLUM = ref({ slug: "plum", label: "Plum, raw", source: "manual", energyKcal: 46 });
const PRUNE = ref({ slug: "prune", label: "Prune", energyKcal: 229 });
const LEEK = ref({
  slug: "leek",
  label: "Leek",
  foodGroupRef: "non_starchy_veg",
  ciqualCode: "20039",
  ciqualName: "Poireau, cru",
  energyKcal: 32.3,
  proteinG: 1.5,
  carbsG: 4.9,
  fatG: 0.2,
  fiberG: 2.3,
  yieldClass: "veg_shrinks",
  folateSource: true,
});
/** La poire APRÈS la migration: décrochée du poireau, et non traçable. */
const PEAR = ref({
  slug: "pear",
  label: "Pear",
  energyKcal: 53.1,
  proteinG: 0.5,
  carbsG: 11.4,
  fatG: 0.5,
  fiberG: 3.1,
  unitGrams: 150,
  validation: "a_verifier",
});

const REFS = [GRAPES, RAISINS, RAISIN_SLUG, PLUM, PRUNE, LEEK, PEAR];

/** Les alias réels, ceux d'avant le lot et ceux que la migration ajoute. */
const ALIASES = [
  { alias: "poire", slug: "pear" },
  { alias: "poires", slug: "pear" },
  { alias: "poireau", slug: "leek" },
  { alias: "raisin frais", slug: "grapes" },
  { alias: "raisins frais", slug: "grapes" },
  { alias: "raisin sec", slug: "raisins" },
  { alias: "raisins secs", slug: "raisins" },
  { alias: "pruneau", slug: "prune" },
  { alias: "pruneaux", slug: "prune" },
  { alias: "prunes sechees", slug: "prune" },
  { alias: "dried plums", slug: "prune" },
];

/** Les quatre faux amis de la migration, langue `fr`. */
const FAUX_AMIS = [
  { alias: "raisin", slug: "grapes" },
  { alias: "raisins", slug: "grapes" },
  { alias: "prune", slug: "plum" },
  { alias: "prunes", slug: "plum" },
];

const FR: CompositionIndex = buildCompositionIndex(REFS, ALIASES, FAUX_AMIS);
/** L'index ANGLAIS: aucun faux ami, donc le comportement d'avant le lot A. */
const EN: CompositionIndex = buildCompositionIndex(REFS, ALIASES);

// ═══════════════════════════════════════════════════════════════════════════
// ① LE RAISIN — frais et sec, deux lignes, deux termes
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("le raisin FRANÇAIS est le fruit frais, le raisin SEC reste atteignable", () => {
  // Le défaut: `raisin` EST un slug anglais valide (le fruit sec, 321 kcal).
  assertEquals(resolveIngredient(FR, "raisin")?.slug, "grapes");
  assertEquals(resolveIngredient(FR, "raisin")?.energyKcal, 68.9);
  assertEquals(resolveIngredient(FR, "raisins")?.slug, "grapes");

  // ⛔ ET LE FRUIT SEC N'EST PAS PERDU. Un correctif qui le rendrait
  // inatteignable remplacerait un aliment faux par un aliment manquant.
  assertEquals(resolveIngredient(FR, "raisins secs")?.slug, "raisins");
  assertEquals(resolveIngredient(FR, "raisin sec")?.slug, "raisins");
  assertEquals(resolveIngredient(FR, "raisins secs")?.energyKcal, 321);

  // Les deux ne rendent PAS la même ligne — c'est toute la question.
  assert(
    resolveIngredient(FR, "raisin")?.slug !== resolveIngredient(FR, "raisins secs")?.slug,
    "le frais et le sec retombent sur la même ligne",
  );
});

Deno.test("`sec` est un MODIFICATEUR: sans l'alias de la forme complète, le sec deviendrait frais", () => {
  // ⛔ LE PIÈGE DU CORRECTIF, ET IL EST RÉEL. `sec`/`seche`/`sechees`/`dried`
  // sont dans `PREPARATION_MODIFIERS`: ils TOMBENT. « prunes séchées » se
  // réduit donc à « prunes », qui est désormais un faux ami rendant le fruit
  // FRAIS. Seul l'alias de la forme complète — essayée AVANT toute réduction —
  // tient le sec.
  assertEquals(resolveIngredient(FR, "prunes sechees")?.slug, "prune");
  assertEquals(resolveIngredient(FR, "prunes sechees")?.energyKcal, 229);

  // La contre-épreuve: le même index SANS cet alias rend le fruit frais.
  const sansAlias = buildCompositionIndex(
    REFS,
    ALIASES.filter((a) => a.alias !== "prunes sechees"),
    FAUX_AMIS,
  );
  assertEquals(resolveIngredient(sansAlias, "prunes sechees")?.slug, "plum");
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA PRUNE — le fruit frais en français, le pruneau toujours joignable
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("la prune FRANÇAISE est le fruit frais, le pruneau reste atteignable", () => {
  assertEquals(resolveIngredient(FR, "prune")?.slug, "plum");
  assertEquals(resolveIngredient(FR, "prune")?.energyKcal, 46);
  assertEquals(resolveIngredient(FR, "prunes")?.slug, "plum");

  assertEquals(resolveIngredient(FR, "pruneau")?.slug, "prune");
  assertEquals(resolveIngredient(FR, "pruneaux")?.slug, "prune");
  assertEquals(resolveIngredient(FR, "pruneaux")?.energyKcal, 229);
});

Deno.test("un index ANGLAIS n'a AUCUN faux ami — le comportement d'avant le lot", () => {
  // ⛔ LA LANGUE EST DANS LA LIGNE, PAS DANS UNE DEVINETTE. « raisins » en
  // anglais, ce sont des raisins SECS. Un index anglais doit donc se comporter
  // exactement comme avant ce lot: le slug nu parle en premier.
  assertEquals(resolveIngredient(EN, "raisin")?.slug, "raisin");
  assertEquals(resolveIngredient(EN, "raisin")?.energyKcal, 321);
  assertEquals(resolveIngredient(EN, "raisins")?.slug, "raisins");
  assertEquals(resolveIngredient(EN, "raisins")?.energyKcal, 321);
  assertEquals(resolveIngredient(EN, "prune")?.slug, "prune");
  assertEquals(resolveIngredient(EN, "prunes")?.slug, "prune");
  assertEquals(resolveIngredient(EN, "prunes")?.energyKcal, 229);
});

Deno.test("le contrat général tient: un alias ne masque JAMAIS un slug hors faux amis", () => {
  // `leek` est un slug ET un alias vers lui-même: rien ne change.
  assertEquals(resolveIngredient(FR, "leek")?.slug, "leek");
  // Un terme sans faux ami passe par les portes d'origine, dans l'ordre.
  assertEquals(resolveIngredient(FR, "poireau")?.slug, "leek");
  assertEquals(resolveIngredient(FR, "sumac"), null);
  assertEquals(resolveIngredient(FR, ""), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA POIRE — et la garde qui doit MORDRE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA GARDE, ÉCRITE UNE FOIS ET APPLIQUÉE DEUX FOIS.
 *
 * ⛔ « Une garde qui ne mord jamais ressemble trait pour trait à une garde qui
 * marche » — cicatrice nommée du dépôt. La garde est donc une FONCTION, passée
 * ① à l'index réparé (elle doit se taire) et ② à un index empoisonné où `pear`
 * reprend les valeurs du poireau (elle doit lever). Sans ②, ce fichier
 * passerait au vert même si la migration n'avait rien fait.
 *
 * ⚠️ ELLE NE REGARDE PAS QUE LE SLUG. `poire → pear` était DÉJÀ vrai avant le
 * lot: le slug était bon, c'est la LIGNE qui portait un autre aliment. Une
 * garde sur le slug seul aurait été verte tout du long.
 */
function laPoireNEstPasUnPoireau(index: CompositionIndex): void {
  const poire = resolveIngredient(index, "poire");
  const poireau = resolveIngredient(index, "poireau");
  assert(poire, "« poire » ne résout plus");
  assert(poireau, "« poireau » ne résout plus");
  assertEquals(poire.slug, "pear");
  assertEquals(poireau.slug, "leek");
  assert(
    poire.energyKcal !== poireau.energyKcal,
    `la poire porte l'énergie du poireau: ${poire.energyKcal} kcal des deux côtés`,
  );
  assert(
    poire.proteinG !== poireau.proteinG && poire.carbsG !== poireau.carbsG,
    "la poire porte les macronutriments du poireau",
  );
  assert(
    !String(poire.ciqualName ?? "").toLowerCase().includes("poireau"),
    `la ligne de la poire s'appelle « ${poire.ciqualName} »`,
  );
  assert(
    poire.ciqualCode !== poireau.ciqualCode,
    `la poire et le poireau partagent le code ${poire.ciqualCode}`,
  );
  assert(
    poire.folateSource === false,
    "la poire porte la sentinelle folates du poireau",
  );
}

Deno.test("la poire ne porte PLUS les valeurs du poireau", () => {
  laPoireNEstPasUnPoireau(FR);
  laPoireNEstPasUnPoireau(EN);
});

Deno.test("⛔ LA CONTRE-ÉPREUVE — la garde de la poire MORD sur le défaut d'origine", () => {
  // La ligne EXACTE d'avant la migration `20260911040000`.
  const poireEmpoisonnee = ref({
    slug: "pear",
    label: "Pear",
    ciqualCode: "20039",
    ciqualName: "Poireau, cru",
    energyKcal: 32.3,
    proteinG: 1.5,
    carbsG: 4.9,
    fatG: 0.2,
    fiberG: 2.3,
    unitGrams: 150,
    folateSource: true,
  });
  const empoisonne = buildCompositionIndex(
    [GRAPES, RAISINS, RAISIN_SLUG, PLUM, PRUNE, LEEK, poireEmpoisonnee],
    ALIASES,
    FAUX_AMIS,
  );
  // Le slug, lui, est resté bon: c'est pour ça qu'une garde sur le slug seul
  // n'aurait rien vu.
  assertEquals(resolveIngredient(empoisonne, "poire")?.slug, "pear");
  assertThrows(
    () => laPoireNEstPasUnPoireau(empoisonne),
    Error,
    undefined,
    "la garde est passée sur la ligne empoisonnée: elle ne mord pas",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE MANIFESTE — ce qui a le droit de composer
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("une référence du SAS n'est pas composable", () => {
  // Le sas promeut ce qu'un MODÈLE a écrit, après trois observations. Ce n'est
  // pas une mesure. Mesuré le 2026-09-11: 2 des 18 lignes `sas` portent une
  // énergie d'aliment CUIT sur une classe qui déclare du CRU
  // (`lentilles_mijotees` 116 kcal en `legume_absorbs`, ÷2,4).
  const sas = ref({ slug: "lentilles_mijotees", source: "sas", energyKcal: 116 });
  assertEquals(validationOf(sas), "a_verifier");
  assertEquals(isComposable(sas), false);

  // Et les deux autres provenances de modèle, qui ne vivent qu'en mémoire.
  assertEquals(isComposable(ref({ slug: "x", source: "model" })), false);
  assertEquals(isComposable(ref({ slug: "y", source: "group_bounds" })), false);
});

Deno.test("⛔ ARBITRAGE ① — `source='ciqual'` SANS `ciqual_code` reste `verifie`", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // CE TEST EST UNE ÉPINGLE, PAS UNE VÉRIFICATION DE PLUS.
  //
  // Mesuré le 2026-09-11 sur les 943 lignes: **689 des 881 lignes `ciqual`
  // n'ont AUCUN `ciqual_code`** — elles viennent de l'import de masse
  // `20260812090000`, qui n'a pas importé la colonne. Elles ne sont pas
  // FAUSSES, elles sont NON TRAÇABLES.
  //
  // Exiger un code pour être « vérifié » ramènerait le catalogue composable de
  // 881 à 192 lignes, c'est-à-dire casserait le produit. Quiconque voudra
  // « durcir » la règle passera par ce test, et devra mesurer avant.
  // ══════════════════════════════════════════════════════════════════════════
  const sansCode = ref({ slug: "pear_var_conference_pulp", source: "ciqual", energyKcal: 53.1 });
  assertEquals(sansCode.ciqualCode, undefined);
  assertEquals(validationOf(sansCode), "verifie");
  assertEquals(isComposable(sansCode), true);

  // Et la main humaine aussi: 44 lignes `manual` (skyr, halloumi, huile de
  // coco…) que CIQUAL 2020 ne contient pas.
  assertEquals(isComposable(ref({ slug: "skyr", source: "manual" })), true);
});

Deno.test("l'EXCEPTION écrite en base gagne sur la règle, dans les deux sens", () => {
  // `pear` est `ciqual`: la règle dirait `verifie`. La base dit `a_verifier`.
  assertEquals(defaultValidationFor(PEAR.source), "verifie");
  assertEquals(validationOf(PEAR), "a_verifier");
  assertEquals(isComposable(PEAR), false);

  // Et l'inverse: une ligne `sas` qu'un humain a relue redevient composable.
  const relue = ref({ slug: "ricotta", source: "sas", validation: "verifie" });
  assertEquals(isComposable(relue), true);

  // `rejete` est le troisième état, et il ferme aussi.
  assertEquals(validationOf(RAISIN_SLUG), "rejete");
  assertEquals(isComposable(RAISIN_SLUG), false);
});

Deno.test("`validationOf` est le SEUL chemin: un champ absent rend la règle, pas `verifie`", () => {
  // ⛔ La cicatrice visée: « un paramètre de garde optionnel est une garde
  // désarmée ». Ici l'absence ne désarme rien — elle veut dire « aucune
  // exception », et la règle par provenance s'applique quand même.
  const sasSansChamp = ref({ slug: "z", source: "sas" });
  assertEquals(sasSansChamp.validation, undefined);
  assertEquals(validationOf(sasSansChamp), "a_verifier");
});

Deno.test("`unverifiedSlugs` nomme les lignes douteuses d'une mesure", () => {
  assertEquals(
    unverifiedSlugs([GRAPES, PEAR, ref({ slug: "a", source: "sas" }), GRAPES]),
    ["a", "pear"],
  );
  assertEquals(unverifiedSlugs([GRAPES, RAISINS]), []);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES COMPTEURS — ni le faux ami ni la ligne douteuse ne passent en silence
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("une mesure DIT qu'elle s'est appuyée sur un faux ami et sur une ligne douteuse", () => {
  const r = resolveIngredients(FR, [
    { term: "raisin", amount: 100, unit: "g", state: "raw" },
    { term: "poire", amount: 150, unit: "g", state: "raw" },
    { term: "raisins secs", amount: 30, unit: "g", state: "raw" },
  ]);
  assertEquals(r.resolved.length, 3);
  // Le faux ami a mordu sur « raisin », et sur lui seul.
  assertEquals(r.falseFriendTerms, ["raisin"]);
  // `pear` est `a_verifier` (§⑤ de la migration): la mesure le NOMME.
  assertEquals(r.unverifiedTerms, ["poire"]);
  // Et les deux termes comptent quand même dans les sommes: la porte est à la
  // COMPOSITION, pas à la mesure (arbitrage ② du socle).
  assertEquals(r.coverage, 1);

  // Sans faux ami — index anglais — les deux compteurs disent autre chose.
  const en = resolveIngredients(EN, [{ term: "raisin", amount: 100, unit: "g", state: "raw" }]);
  assertEquals(en.falseFriendTerms, []);
});
