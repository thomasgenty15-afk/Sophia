/**
 * KEEL — comment un allergène s'ÉCRIT en prose, par opposition à ce qu'il
 * CONTIENT.
 *
 * ── LE DÉFAUT MESURÉ (QA agent 4, 2026-08-03) ─────────────────────────────
 * Élève avec `allergen_ref='peanut'`, `severity='medical'`, réellement en base.
 * L'agent a répondu, et le message est PARTI (`reason: "clean"`):
 *
 *     "the nut butter option is the stronger bag snack than plain nuts"
 *
 * `findMedicalConstraintViolations` construisait ses termes ainsi:
 *
 *     terms.push({ ruleId: constraint.id, token })   // et rien d'autre
 *
 * — c'est-à-dire le slug NU. Le matcher supportait `surfaceForms` depuis le
 * premier jour (`forbidden_matcher.ts :: ForbiddenTerm`), et la doctrine du
 * coach s'en servait; la ceinture médicale, elle, ne les alimentait jamais. La
 * garde la plus critique du produit était donc la seule des deux à matcher un
 * unique mot. Sonde déterministe, contrainte `peanut`:
 *
 *     "A spoon of peanut butter works well."   -> BLOCKED   (le slug apparaît)
 *     "the nut butter option ..."              -> PASSED    ← sortie réelle
 *     "Try PB on rice cakes."                  -> PASSED
 *     "Groundnut paste is a good protein."     -> PASSED
 *     "Satay sauce over chicken."              -> PASSED
 *
 * ── POURQUOI CE FICHIER, ET PAS `allergen_bridge.ts` ──────────────────────
 * `skills/plan_question/allergen_bridge.ts` existe et mappe déjà
 * `peanut -> nuts_seeds`. Il répond à une AUTRE question: « substituer vers ce
 * groupe alimentaire met-il structurellement l'allergène dans l'assiette ? ».
 * Sa sortie est un slug de `food_groups`, un vocabulaire fermé de 30 entrées —
 * inutilisable pour matcher de la PROSE, où le danger s'appelle « satay » ou
 * « PB ». Deux questions, deux tables. Ce qu'elles partagent est la doctrine,
 * pas les données.
 *
 * Il vit dans `_shared/keel/` et non dans un dossier de skill parce que ses
 * deux consommateurs sont dans des couches différentes: la ceinture de
 * conversation (`skills/_shared/keel_output_locks.ts`) et le verrou 4 de la
 * génération de plan (`week_plan_generation.ts`). Un skill ne peut pas être la
 * maison d'une donnée dont dépend `generate-week-plan-v1`.
 *
 * ── LA DOCTRINE, REPRISE MOT POUR MOT DE `allergen_bridge.ts` ─────────────
 * Liste plate, fermée, écrite à la main. **Jamais une inférence.** Un slug
 * absent de cette table garde exactement le comportement d'avant (son propre
 * token, rien de plus) — l'ajout ne peut donc pas RÉDUIRE la couverture.
 *
 * Sur-bloquer escalade; sous-bloquer sert l'allergène. Seul le premier est
 * récupérable. C'est ce qui tranche les deux cas limites de cette table:
 *
 *   * `nut_butter` est listé sous `peanut` alors qu'un beurre d'amande est
 *     techniquement sûr pour une allergie à l'arachide seule. On l'assume: la
 *     contamination croisée des beurres de fruits à coque est un risque
 *     clinique réel, et le coût d'un faux positif est une phrase reformulée.
 *   * `satay` est listé: une sauce satay EST une sauce à l'arachide, et aucun
 *     élève ne lit « satay » comme « arachide » sur une étiquette.
 *
 * Les exceptions de NÉGATION s'appliquent aux formes de surface comme au
 * token (même moteur, même passe): « avoid nut butter » reste licite, sinon le
 * plan d'un élève allergique — littéralement fait d'évictions — serait rejeté à
 * chaque tour.
 *
 * PURE MODULE: aucun I/O, aucune horloge, aucun aléatoire.
 */

/**
 * Formes de surface par slug d'allergène/substance.
 *
 * Le token lui-même n'est JAMAIS répété ici: `findForbiddenMatches` le matche
 * toujours, et `tokenPattern` couvre déjà le pluriel et les séparateurs
 * (`tree_nut` matche « tree nut », « tree-nut », « tree nuts »). On ne liste
 * donc que ce que le slug ne peut pas produire tout seul.
 *
 * EN + FR: la branche legacy génère encore du français, et un élève peut être
 * servi dans l'une ou l'autre langue.
 */
export const ALLERGEN_SURFACE_FORMS: Readonly<
  Record<string, readonly string[]>
> = {
  peanut: [
    "nut butter",
    "groundnut",
    "monkey nut",
    "satay",
    "PB",
    "arachide",
    "beurre de cacahuete",
    "cacahuete",
  ],
  tree_nut: [
    "nut butter",
    "almond",
    "cashew",
    "hazelnut",
    "walnut",
    "pecan",
    "pistachio",
    "macadamia",
    "praline",
    "marzipan",
    "nutella",
    "fruits a coque",
  ],
  gluten: ["wheat", "barley", "rye", "spelt", "semolina", "couscous", "seitan", "ble"],
  wheat: ["semolina", "couscous", "spelt", "seitan", "ble"],
  lactose: ["milk", "cream", "butter", "cheese", "yoghurt", "yogurt", "lait", "fromage"],
  dairy: ["milk", "cream", "butter", "cheese", "yoghurt", "yogurt", "lait", "fromage"],
  milk: ["cream", "butter", "cheese", "yoghurt", "yogurt", "lait", "fromage"],
  casein: ["milk", "cheese", "whey", "lait", "fromage"],
  egg: ["omelette", "mayonnaise", "meringue", "oeuf"],
  eggs: ["omelette", "mayonnaise", "meringue", "oeuf"],
  fish: ["salmon", "tuna", "cod", "anchovy", "sardine", "saumon", "thon", "poisson"],
  shellfish: ["prawn", "shrimp", "crab", "lobster", "mussel", "oyster", "scallop", "crevette", "crustace"],
  crustacean: ["prawn", "shrimp", "crab", "lobster", "crevette"],
  mollusc: ["mussel", "oyster", "scallop", "squid", "calamari", "moule", "huitre"],
  sesame: ["tahini", "hummus", "houmous", "halva"],
  soy: ["soya", "tofu", "tempeh", "edamame", "miso", "soja"],
  soya: ["soy", "tofu", "tempeh", "edamame", "miso", "soja"],
  alcohol: ["beer", "wine", "spirits", "biere", "vin"],
  pork: ["bacon", "ham", "sausage", "chorizo", "jambon", "lardon"],
  shrimp: ["prawn", "crevette"],
};

/**
 * Les formes de surface d'un slug, ou `[]` s'il n'est pas dans la table.
 *
 * `[]` et non `null`: contrairement à `foodGroupsCoveredBy`, l'absence n'a pas
 * besoin d'un troisième état ici. Une contrainte inconnue de cette table est
 * toujours matchée par son propre token — le comportement d'avant. Rien
 * n'abstient, rien ne régresse.
 */
export function surfaceFormsFor(constraintRef: string): string[] {
  const slug = String(constraintRef ?? "").trim().toLowerCase();
  if (slug === "") return [];
  const forms = ALLERGEN_SURFACE_FORMS[slug];
  return forms ? [...forms] : [];
}
