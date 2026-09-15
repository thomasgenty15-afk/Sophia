// RAPPROCHER UNE ASSIETTE D'UN PLAT PRÉVU — ce que ces tests protègent.
//
// L'ARBITRAGE CENTRAL: on n'écrit pas un fait sur une ressemblance. Le module
// rend un verdict, jamais un geste, et `confident` est réservé au seul cas où
// une machine peut trancher sans demander — un candidat, créneau d'accord,
// tous ses groupes présents. Tout le reste demande.
//
// Le second invariant, plus discret et plus dangereux à perdre: la
// normalisation reste PAUVRE. Chaque règle de rapprochement en plus est une
// occasion de coller deux aliments qui n'ont rien à voir, et une fausse coche
// écrit un fait faux dans la table que le coach lit.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type FoodCatalogueItem,
  groupForTerm,
  matchPlannedDish,
  normalizeTerm,
  type PlannedDish,
} from "./planned_dish_match.ts";

/** Un extrait fidèle de `food_items` (migration 20260805140000). */
const CATALOGUE: FoodCatalogueItem[] = [
  { slug: "greek_yogurt", label: "Greek yogurt", food_group_ref: "dairy_yogurt" },
  { slug: "plain_yogurt", label: "Plain yogurt", food_group_ref: "dairy_yogurt" },
  { slug: "oats", label: "Oats", food_group_ref: "whole_grain" },
  { slug: "brown_rice", label: "Brown rice", food_group_ref: "whole_grain" },
  { slug: "banana", label: "Banana", food_group_ref: "other_fruit" },
  { slug: "peanut_butter", label: "Peanut butter", food_group_ref: "nuts_seeds" },
  { slug: "chicken_breast", label: "Chicken breast", food_group_ref: "poultry" },
  { slug: "broccoli", label: "Broccoli", food_group_ref: "cruciferous_veg" },
  { slug: "honey", label: "Honey", food_group_ref: "sugar_sweets" },
];

/** Le plat réel lu en base sur la composition du fondateur. */
const OAT_BOWL: PlannedDish = {
  title: "Greek yogurt oats with banana and peanut butter",
  slot: "breakfast",
  ingredients: [
    { term: "rolled oats" },
    { term: "Greek yogurt" },
    { term: "banana" },
    { term: "peanut butter" },
    { term: "honey" },
  ],
};

const CHICKEN: PlannedDish = {
  title: "Chicken, rice and broccoli",
  slot: "lunch",
  ingredients: [
    { term: "chicken breast" },
    { term: "brown rice" },
    { term: "broccoli" },
  ],
};

Deno.test("normalizeTerm reste pauvre, et c'est le point", () => {
  assertEquals(normalizeTerm("Greek Yogurt"), "greek yogurt");
  assertEquals(normalizeTerm("rolled  oats!"), "rolled oat");
  // « ufs » fait 3 lettres après dépliage: sous la règle du pluriel, donc
  // laissé tel quel. Le comportement est celui de la règle, pas un oubli.
  assertEquals(normalizeTerm("Œufs brouillés"), "ufs brouille");
  // Pas de racinisation: « cooking » ne devient pas « cook ».
  assertEquals(normalizeTerm("cooking"), "cooking");
});

Deno.test("les pluriels en -es et -ies, trouvés par le banc", () => {
  // MESURÉ sur les 1417 ingrédients réellement générés: « potatoes » (×10) et
  // « cherry tomatoes » (×11) ne trouvaient rien, parce qu'un simple retrait du
  // « s » donne « potatoe » et « tomatoe ». Deux des dix termes les plus
  // fréquents du corpus, perdus sur une règle d'orthographe.
  assertEquals(normalizeTerm("potatoes"), "potato");
  assertEquals(normalizeTerm("cherry tomatoes"), "cherry tomato");
  assertEquals(normalizeTerm("berries"), "berry");
  assertEquals(normalizeTerm("peaches"), "peach");
  // Et les mots qui se terminent en -ss ne sont pas amputés.
  assertEquals(normalizeTerm("cress"), "cress");
  assertEquals(normalizeTerm("cheese"), "cheese");
});

Deno.test("le groupe est LU dans le catalogue, jamais deviné", () => {
  assertEquals(groupForTerm("Greek yogurt", CATALOGUE), "dairy_yogurt");
  // Contenance: « rolled oats » atteint « Oats ».
  assertEquals(groupForTerm("rolled oats", CATALOGUE), "whole_grain");
  // Par le slug.
  assertEquals(groupForTerm("peanut_butter", CATALOGUE), "nuts_seeds");
  // Absent du catalogue = pas de groupe. On n'invente pas.
  assertEquals(groupForTerm("sriracha", CATALOGUE), null);
  assertEquals(groupForTerm("", CATALOGUE), null);
});

Deno.test("l'inclusion est PAR MOTS, pas par sous-chaîne", () => {
  // LE PIÈGE: « ice » est une sous-chaîne de « rice », « juice », « lice ».
  // Un seuil de longueur ne suffit pas — il éliminait « Oats » (3 lettres une
  // fois normalisé) et cassait le cas le plus courant du produit.
  const short: FoodCatalogueItem[] = [
    { slug: "ice", label: "Ice", food_group_ref: "water" },
    ...CATALOGUE,
  ];
  assertEquals(groupForTerm("brown rice", short), "whole_grain");
  // Et le mot entier, lui, mord bien.
  assertEquals(groupForTerm("crushed ice", short), "water");
});

Deno.test("les groupes INVISIBLES sur une photo ne comptent pas contre l'élève", () => {
  // Le miel fondu dans un yaourt est nommé par le prompt de vision lui-même
  // comme invisible. L'exiger sur la photo garantirait qu'aucun plat ne matche.
  const honeyOnly: PlannedDish = {
    title: "Drizzle",
    slot: null,
    ingredients: [{ term: "honey" }],
  };
  const m = matchPlannedDish({
    plate: { groups: ["dairy_yogurt"], labels: ["yogurt"], slot: null },
    dishes: [honeyOnly],
    catalogue: CATALOGUE,
  });
  // Un plat sans AUCUNE ancre visible n'est candidat à rien.
  assertEquals(m.candidates.length, 0);
});

Deno.test("UN plat pleinement couvert: verdict confident", () => {
  const m = matchPlannedDish({
    plate: {
      groups: ["poultry", "whole_grain", "cruciferous_veg"],
      labels: ["grilled chicken breast", "brown rice", "broccoli"],
      slot: null,
    },
    dishes: [CHICKEN],
    catalogue: CATALOGUE,
  });
  assertEquals(m.verdict, "confident");
  assertEquals(m.reason, "single_full_cover");
  assertEquals(m.best?.title, CHICKEN.title);
  assertEquals(m.best?.coverage, 1);
  assertEquals(m.best?.missingGroups, []);
  assert(m.best!.matchedTerms.length >= 2);
});

Deno.test("LE CAS RÉEL: le bol d'avoine est PROBABLE, jamais confident", () => {
  // Mesuré: la photo a rendu `[yogurt, rolled oats]` / groupes
  // `[dairy_yogurt, whole_grain]`. Le plat en demande quatre — la banane et le
  // beurre de cacahuète ne sont pas sur l'assiette. On DEMANDE.
  const m = matchPlannedDish({
    plate: {
      groups: ["dairy_yogurt", "whole_grain"],
      labels: ["yogurt", "rolled oats"],
      slot: null,
    },
    dishes: [OAT_BOWL],
    catalogue: CATALOGUE,
  });
  assertEquals(m.verdict, "probable");
  assertEquals(m.best?.coverage, 0.5);
  // La question est intelligible parce qu'on sait CE QUI manque.
  assertEquals(
    [...m.best!.missingGroups].sort(),
    ["nuts_seeds", "other_fruit", "sugar_sweets"].sort(),
  );
});

Deno.test("DEUX plats pleinement couverts: on demande, on ne tranche pas", () => {
  const twin: PlannedDish = { ...CHICKEN, title: "Chicken rice bowl" };
  const m = matchPlannedDish({
    plate: {
      groups: ["poultry", "whole_grain", "cruciferous_veg"],
      labels: ["chicken", "rice", "broccoli"],
      slot: null,
    },
    dishes: [CHICKEN, twin],
    catalogue: CATALOGUE,
  });
  assertEquals(m.verdict, "probable");
  assertEquals(m.reason, "several_plausible");
  assertEquals(m.candidates.length, 2);
});

Deno.test("un créneau qui se CONTREDIT élimine le candidat", () => {
  // L'élève a rangé sa photo au petit-déjeuner; le plat est un déjeuner.
  // Lui proposer son déjeuner est une proposition qu'il n'acceptera pas.
  const m = matchPlannedDish({
    plate: {
      groups: ["poultry", "whole_grain", "cruciferous_veg"],
      labels: ["chicken", "rice", "broccoli"],
      slot: "breakfast",
    },
    dishes: [CHICKEN],
    catalogue: CATALOGUE,
  });
  assertEquals(m.verdict, "none");
  assertEquals(m.reason, "nothing_reaches");
});

Deno.test("un créneau ABSENT côté assiette ne disqualifie rien", () => {
  // `slot_key` est NULL sur 71 % des lignes: le traiter comme un désaccord
  // désarmerait le rapprochement pour les deux tiers des repas.
  //
  // Les libellés NOMMENT les trois aliments, comme le fait un vrai retour de
  // modèle (« grilled chicken breast, brown rice, broccoli florets »): depuis
  // la garde sur les termes, une assiette qui déclare trois groupes sans
  // nommer les aliments ne coche plus — et c'est un autre test que celui-ci.
  const m = matchPlannedDish({
    plate: {
      groups: ["poultry", "whole_grain", "cruciferous_veg"],
      labels: ["grilled chicken breast", "brown rice", "broccoli florets"],
      slot: null,
    },
    dishes: [CHICKEN],
    catalogue: CATALOGUE,
  });
  assertEquals(m.verdict, "confident");
});

Deno.test("LA GARDE SUR LES TERMES: mêmes groupes, autres aliments → jamais confident", () => {
  // LE FAUX POSITIF MESURÉ EN RUN RÉEL LE 2026-08-05, 3/3, sur de vraies
  // photos: une assiette de poulet/riz/brocolis a coché « Duck breast with
  // quinoa and cauliflower ». Le canard et le poulet sont tous deux `poultry`,
  // le quinoa et le riz `whole_grain`, le chou-fleur et le brocoli
  // `cruciferous_veg` — couverture de groupes parfaite, zéro aliment commun.
  //
  // Une fausse coche écrit un fait faux dans la table que le coach lit, et
  // l'élève ne peut pas le retirer. On rétrograde, on ne coche pas.
  const DUCK: PlannedDish = {
    title: "Duck breast with quinoa and cauliflower",
    slot: "lunch",
    ingredients: [
      { term: "duck breast" },
      { term: "quinoa" },
      { term: "cauliflower" },
    ],
  };
  const m = matchPlannedDish({
    plate: {
      groups: ["poultry", "whole_grain", "cruciferous_veg"],
      labels: ["grilled chicken breast", "brown rice", "broccoli florets"],
      slot: null,
    },
    dishes: [DUCK],
    catalogue: [
      ...CATALOGUE,
      { slug: "duck_breast", label: "Duck breast", food_group_ref: "poultry" },
      { slug: "quinoa", label: "Quinoa", food_group_ref: "whole_grain" },
      {
        slug: "cauliflower",
        label: "Cauliflower",
        food_group_ref: "cruciferous_veg",
      },
    ],
  });
  assertEquals(m.verdict, "probable");
  assertEquals(m.reason, "groups_match_terms_do_not");
  // La couverture reste PARFAITE: c'est bien la garde sur les termes qui a
  // mordu, pas un candidat qui n'atteignait pas le seuil.
  assertEquals(m.best?.coverage, 1);
  assertEquals(m.best?.corroboratedGroups, []);
});

Deno.test("CONDITION DE DÉSARMEMENT: le cas nominal coche toujours", () => {
  // Une garde qui mord partout est une garde qu'on débranche dans la semaine.
  // Le libellé du modèle est plus riche que le terme du plat (« grilled
  // chicken breast » contre « Chicken breast »), et l'inclusion par mots
  // entiers doit le rattraper — sinon plus AUCUNE photo ne cocherait.
  const m = matchPlannedDish({
    plate: {
      groups: ["poultry", "whole_grain", "cruciferous_veg"],
      labels: ["grilled chicken breast", "brown rice", "steamed broccoli"],
      slot: "lunch",
    },
    dishes: [CHICKEN],
    catalogue: CATALOGUE,
  });
  assertEquals(m.verdict, "confident");
  assertEquals(m.best?.corroboratedGroups.length, 3);
});

Deno.test("les ingrédients d'une PRÉPARATION comptent pour le plat", () => {
  // LE DÉFAUT QUI RENDAIT LE MÉCANISME MUET SUR LA VRAIE DONNÉE. Le plat livré
  // « Chicken, brown rice and broccoli bowl » n'a pour `ingredients` que
  // brocoli, huile et citron: le poulet et le riz vivent dans la PRÉPARATION
  // que `uses` cite. Sans les lire, le seul vrai plat photographié de la
  // campagne est ressorti `probable` à 0,5 — rétrogradé par un citron que la
  // photo ne peut pas montrer.
  const BOWL: PlannedDish = {
    title: "Chicken, brown rice and broccoli bowl",
    slot: "lunch",
    ingredients: [{ term: "broccoli" }],
    uses: [{ preparationId: "prep_chicken_rice" }],
  };
  const m = matchPlannedDish({
    plate: {
      groups: ["poultry", "whole_grain", "cruciferous_veg"],
      labels: ["grilled chicken breast", "brown rice", "broccoli florets"],
      slot: "lunch",
    },
    dishes: [BOWL],
    catalogue: CATALOGUE,
    preparations: [
      {
        id: "prep_chicken_rice",
        ingredients: [{ term: "chicken breast" }, { term: "brown rice" }],
      },
    ],
  });
  assertEquals(m.verdict, "confident");
  assertEquals(m.best?.anchorGroups.length, 3);
});

Deno.test("l'EAU d'une préparation ne pénalise pas la couverture", () => {
  // Mesuré en run réel: la préparation de riz livrée porte `basmati rice` (hors
  // catalogue), `water` et `salt`. En lisant les préparations sans classer
  // l'eau comme accessoire, on ajoutait au DÉNOMINATEUR une ancre qu'aucune
  // photo ne peut montrer — couverture 1 → 0,667, garantie.
  const m = matchPlannedDish({
    plate: {
      groups: ["poultry", "cruciferous_veg"],
      labels: ["grilled chicken breast", "broccoli florets"],
      slot: "lunch",
    },
    dishes: [{
      title: "Chicken and broccoli",
      slot: "lunch",
      ingredients: [{ term: "broccoli" }],
      uses: [{ preparation_id: "prep_chicken" }],
    }],
    catalogue: [
      ...CATALOGUE,
      { slug: "water", label: "Water", food_group_ref: "water" },
    ],
    preparations: [{
      id: "prep_chicken",
      ingredients: [{ term: "chicken breast" }, { term: "water" }],
    }],
  });
  // L'eau est RAPPORTÉE (elle reste dans `dishGroups`) mais hors dénominateur.
  assert(m.best!.dishGroups.includes("water" as never));
  assertEquals(m.best?.anchorGroups.includes("water" as never), false);
  assertEquals(m.best?.coverage, 1);
  assertEquals(m.verdict, "confident");
});

Deno.test("LA CASSE DU PAYLOAD RÉEL: `preparation_id` marche comme `preparationId`", () => {
  // ── CE TEST EXISTE PARCE QUE SON ABSENCE A COÛTÉ UN RUN ──────────────────
  // La première version lisait `use.preparationId`. Or `mealDishesPayload`
  // sérialise `preparation_id` (snake_case): les DEUX formes coexistent en base
  // (`select distinct k from … jsonb_object_keys(u) k` rend les deux). Le
  // `as PlannedDish[]` du chargeur désarme le typecheck sur ce payload, donc
  // rien n'a signalé l'écart — 90 tests verts, et le rapprochement muet sur
  // toute donnée écrite par le générateur.
  //
  // Motif connu du dépôt: `as-cast-on-foreign-type-disarms-typecheck`.
  const PREPARATIONS = [
    {
      id: "prep_chicken_rice",
      ingredients: [{ term: "chicken breast" }, { term: "brown rice" }],
    },
  ];
  const PLATE = {
    groups: ["poultry", "whole_grain", "cruciferous_veg"],
    labels: ["grilled chicken breast", "brown rice", "broccoli florets"],
    slot: "lunch",
  };
  const snake = matchPlannedDish({
    plate: PLATE,
    dishes: [{
      title: "Chicken, brown rice and broccoli bowl",
      slot: "lunch",
      ingredients: [{ term: "broccoli" }],
      uses: [{ preparation_id: "prep_chicken_rice" }],
    }],
    catalogue: CATALOGUE,
    preparations: PREPARATIONS,
  });
  const camel = matchPlannedDish({
    plate: PLATE,
    dishes: [{
      title: "Chicken, brown rice and broccoli bowl",
      slot: "lunch",
      ingredients: [{ term: "broccoli" }],
      uses: [{ preparationId: "prep_chicken_rice" }],
    }],
    catalogue: CATALOGUE,
    preparations: PREPARATIONS,
  });
  assertEquals(snake.verdict, "confident");
  // Les deux casses doivent rendre EXACTEMENT le même verdict: c'est la seule
  // assertion qui empêche d'en corriger une et d'oublier l'autre.
  assertEquals(snake.verdict, camel.verdict);
  assertEquals(snake.best?.coverage, camel.best?.coverage);
  assertEquals(snake.best?.anchorGroups.length, 3);
});

Deno.test("sous le seuil de couverture, on ne propose RIEN", () => {
  // Un yaourt seul contre un plat qui demande quatre groupes: proposer serait
  // du bruit, et l'élève apprendrait à ignorer la question.
  const m = matchPlannedDish({
    plate: { groups: ["dairy_yogurt"], labels: ["yogurt"], slot: null },
    dishes: [OAT_BOWL],
    catalogue: CATALOGUE,
  });
  assertEquals(m.verdict, "none");
  assertEquals(m.reason, "nothing_reaches");
});

Deno.test("une assiette sans groupe lu ne confirme jamais rien", () => {
  const m = matchPlannedDish({
    plate: { groups: [], labels: ["something brown"], slot: null },
    dishes: [OAT_BOWL, CHICKEN],
    catalogue: CATALOGUE,
  });
  assertEquals(m.verdict, "none");
  assertEquals(m.reason, "no_groups_on_plate");
});

Deno.test("aucun plat prévu: silence, et pas une erreur", () => {
  const m = matchPlannedDish({
    plate: { groups: ["poultry"], labels: ["chicken"], slot: null },
    dishes: [],
    catalogue: CATALOGUE,
  });
  assertEquals(m.verdict, "none");
  assertEquals(m.reason, "no_dishes");
});

Deno.test("un plat dont AUCUN ingrédient n'est au catalogue n'est pas candidat", () => {
  // Absence d'information, pas échec: on ne peut rien comparer.
  const exotic: PlannedDish = {
    title: "Sriracha noodles",
    slot: null,
    ingredients: [{ term: "sriracha" }, { term: "shirataki" }],
  };
  const m = matchPlannedDish({
    plate: { groups: ["poultry"], labels: ["chicken"], slot: null },
    dishes: [exotic],
    catalogue: CATALOGUE,
  });
  assertEquals(m.verdict, "none");
  assertEquals(m.candidates.length, 0);
});

Deno.test("le module ne décide JAMAIS d'écrire", () => {
  // La sortie ne porte ni identifiant d'événement, ni clé de coche, ni ordre.
  // C'est l'appelant qui choisit le geste — et c'est ce qui empêche une
  // ressemblance de devenir un fait sans que personne ne l'ait décidé.
  const m = matchPlannedDish({
    plate: {
      groups: ["poultry", "whole_grain", "cruciferous_veg"],
      labels: ["chicken", "rice", "broccoli"],
      slot: null,
    },
    dishes: [CHICKEN],
    catalogue: CATALOGUE,
  });
  const keys = Object.keys(m).sort();
  assertEquals(keys, ["best", "candidates", "reason", "verdict"]);
  assert(!JSON.stringify(m).includes("meal_tick"));
});
