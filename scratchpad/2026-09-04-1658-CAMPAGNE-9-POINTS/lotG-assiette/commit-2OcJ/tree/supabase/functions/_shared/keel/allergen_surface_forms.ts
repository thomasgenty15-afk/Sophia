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
  // ── LE MOT SOUS LEQUEL LES GENS LE DÉCLARENT MANQUAIT (2026-08-22, lot S1b)
  //
  // La liste portait neuf ANIMAUX et pas un seul des deux mots COLLECTIFS sous
  // lesquels une allergie aux fruits de mer se déclare et s'écrit. Mesuré le
  // 2026-08-22 avant la première ligne de correctif, contrainte
  // `allergen_ref='shellfish'`, `severity='medical'`:
  //
  //     « seafood platter »            -> 0 morsure
  //     « des fruits de mer ce soir »  -> 0 morsure
  //     « a shrimp and crab platter »  -> 2 morsures
  //
  // Et au plancher d'intake, qui lit cette même table:
  //
  //     « I'm allergic to seafood »               -> null
  //     « je suis allergique aux fruits de mer »  -> null
  //     « I'm allergic to shellfish »             -> shellfish
  //
  // C'est-à-dire: la garde tenait sur le nom de chaque bestiole et tombait sur
  // le nom de la CATÉGORIE — celui qu'un menu écrit et qu'un parent tape.
  //
  // ⚠️ « fruit de mer » au singulier est listé à côté du pluriel: `tokenPattern`
  // ajoute le `s` final, jamais le `s` du milieu.
  shellfish: [
    "prawn",
    "shrimp",
    "crab",
    "lobster",
    "mussel",
    "oyster",
    "scallop",
    "crevette",
    "crustace",
    "seafood",
    "fruits de mer",
    "fruit de mer",
  ],
  // LA CLÉ QUI RÉPARE LES LIGNES DÉJÀ EN BASE — même geste que `celeriac`
  // sous `celery`, et pour la même raison (2026-08-22, lot S1b).
  //
  // `student_safety_constraints` porte DEUX lignes `fruits_de_mer`, dont UNE
  // active, écrites le 2026-08-04 — c'est-à-dire AVANT que
  // `ALLERGEN_REF_ALIASES` (`allergen_catalog.ts`, 2026-08-19) ne ramène ce mot
  // sur `shellfish` à l'écriture. L'alias ne vaut que pour les écritures
  // FUTURES: il ne réécrit rien, et rien ne doit réécrire une contrainte de
  // sécurité déclarée par quelqu'un. Sans cette clé, ces lignes-là restent
  // couvertes par leur seul mot, en français, dans un plan écrit en anglais.
  //
  // ⛔ CE N'EST PAS UN RAPPROCHEMENT FLOU. `surfaceFormsFor` est une lecture
  // par clé EXACTE: la seule façon de couvrir un slug est de l'écrire ici, à la
  // main, avec ses formes. C'est le même arbitrage que `celeriac`, mesuré le
  // 2026-08-19 sur trois lignes réelles.
  //
  // ⚠️ « shellfish » est listé ICI alors qu'il ne l'est jamais sous `shellfish`
  // (une table ne répète pas son propre jeton): pour une ligne dont le slug est
  // `fruits_de_mer`, le mot anglais du danger est une forme de surface comme
  // une autre — et c'est précisément celui que le plan écrit.
  fruits_de_mer: [
    "shellfish",
    "seafood",
    "prawn",
    "shrimp",
    "crab",
    "lobster",
    "mussel",
    "oyster",
    "scallop",
    "crevette",
    "crustace",
    "fruit de mer",
  ],
  crustacean: ["prawn", "shrimp", "crab", "lobster", "crevette"],
  mollusc: ["mussel", "oyster", "scallop", "squid", "calamari", "moule", "huitre"],
  sesame: ["tahini", "hummus", "houmous", "halva"],
  soy: ["soya", "tofu", "tempeh", "edamame", "miso", "soja"],
  soya: ["soy", "tofu", "tempeh", "edamame", "miso", "soja"],
  alcohol: ["beer", "wine", "spirits", "biere", "vin"],
  pork: ["bacon", "ham", "sausage", "chorizo", "jambon", "lardon"],
  shrimp: ["prawn", "crevette"],
  // ── LES QUATRE MAJEURS RÉGLEMENTAIRES QUI MANQUAIENT (2026-08-19) ────────
  //
  // La table s'arrêtait à dix dangers, et le catalogue à treize jetons. Quatre
  // des QUATORZE allergènes majeurs UE/UK n'y étaient nulle part: céleri,
  // moutarde, lupin, sulfites. Conséquence mesurée en run réel: une contrainte
  // `celeriac` — trois lignes réelles en base locale — n'était reconnue que
  // sous son propre mot; le plan écrivait « celery », et la ceinture ne
  // bronchait pas. C'est exactement le défaut de 2026-08-03 (« the nut butter
  // option »), rejoué sur un autre allergène.
  //
  // ⚠️ AJOUT STRICTEMENT ADDITIF, comme tout le reste de cette table. Aucune
  // clé existante n'est touchée: un élève `peanut` reçoit octet pour octet les
  // mêmes aiguilles qu'avant. Les nouvelles clés ne changent le comportement
  // que des lignes dont le slug est l'une d'elles — et pour celles-là, elles
  // ne peuvent qu'ÉLARGIR la reconnaissance, jamais la réduire.
  //
  // ⛔ AUCUN MATCHER MAISON, et c'est ce que ces six lignes évitent. La
  // tentation était d'apparier `celeriac` et `celery` par leur préfixe commun.
  // « laitue » ≠ « lait », douze faux positifs sur douze mesurés dans ce
  // dépôt: le rapprochement est écrit À LA MAIN, une paire à la fois, ou il
  // n'est pas écrit.
  celery: [
    // `celeriac` n'est PAS matché par le jeton `celery`: `tokenPattern` ancre
    // sur des frontières de mot, et « celeriac » n'a pas « celery » dedans.
    "celeriac",
    // FR. `normalizeForMatch` retire les diacritiques, donc « céleri » arrive
    // ici en « celeri » — qui couvre aussi « céleri-rave » et « céleri
    // rémoulade », le motif s'arrêtant à une frontière non alphanumérique.
    "celeri",
    // Assumé, même arbitrage que `satay` sous `peanut`: une mirepoix EST
    // oignon-carotte-céleri, et personne ne lit « mirepoix » comme « céleri »
    // sur une méthode de cuisson. Sur-bloquer coûte une phrase reformulée;
    // sous-bloquer sert l'allergène.
    "mirepoix",
  ],
  // LA CLÉ QUI RÉPARE LES LIGNES DÉJÀ EN BASE. Trois contraintes locales
  // portent `celeriac` — saisi en texte libre, donc jamais catalogué. Sans
  // cette entrée, l'ajout de `celery` au catalogue n'aurait rien fait pour
  // elles: `surfaceFormsFor` est une lecture par clé EXACTE, et leur slug
  // n'est pas `celery`.
  celeriac: ["celery", "celeri", "mirepoix"],
  mustard: [
    "dijon",
    "moutarde",
    // Une rémoulade — française comme louisianaise — est une mayonnaise
    // MOUTARDÉE. Le mot ne dit pas « moutarde », et c'est précisément la
    // classe de cas que cette table existe pour attraper.
    "remoulade",
  ],
  // LA GRAPHIE BRITANNIQUE EST LE JETON DU CATALOGUE (`sulphite`), parce que
  // c'est celle de la liste réglementaire que ce produit sert. La graphie
  // américaine reste une SAISIE LIBRE plausible, d'où la clé miroir juste en
  // dessous — sinon un élève qui tape « sulfites » perdrait la couverture que
  // le même élève obtiendrait en cochant la case.
  sulphite: [
    "sulfite",
    "sulphur dioxide",
    "sulfur dioxide",
    // FR — le nom d'étiquette, qui ne contient pas le mot « sulfite ».
    "anhydride sulfureux",
    // Les numéros E les plus fréquents. `tokenPattern` les traite comme des
    // mots entiers, donc « e220 » ne mord pas dans « re220 » ni dans un
    // nombre.
    "e220",
    "e223",
  ],
  sulfite: [
    "sulphite",
    "sulphur dioxide",
    "sulfur dioxide",
    "anhydride sulfureux",
    "e220",
    "e223",
  ],
  // ⚠️ CE QUI N'EST PAS LISTÉ SOUS LES SULFITES, ET C'EST UN ARBITRAGE ÉCRIT.
  // Le vin, le vinaigre et les fruits secs en portent presque toujours. Les
  // mettre ici ferait mordre la ceinture sur la moitié des plans de n'importe
  // quel élève sulfito-sensible — c'est-à-dire une garde qui casse sur sa
  // population cible, la cicatrice « analogue végétal » prise par l'autre
  // bout. On liste ce qui NOMME la substance, jamais ce qui en contient
  // ordinairement.
  lupin: [
    // `lupin` ne matche PAS « lupine » ni « lupini »: le suffixe toléré par
    // `tokenPattern` est `(?:e?s)?`, donc « s » ou « es », jamais « e » seul.
    "lupine",
    "lupini",
    "lupinus",
  ],
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
