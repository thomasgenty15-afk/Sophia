import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";

import { buildMealPrompt, MEAL_PROMPT_VERSION } from "./meal_generation.ts";
import { RAW_WINDOW_DAYS } from "./fridge_window.ts";
import {
  daysNeedingTheirOwnShop,
  lastDayReachedFromFirstShop,
  RAW_FAMILIES,
  rawKeepingBreaches,
  rawReachLines,
} from "./raw_keeping.ts";
import { buyDatesByIndex } from "./grocery_waves.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI NE PEUT PAS ATTENDRE ENTRE LA COURSE ET LA CASSEROLE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL LE 2026-09-01 ───────────────────
 *     « ça me disait de cuisiner le poulet acheté le lundi, le samedi »
 *
 * La fenêtre crue EXISTAIT (`RAW_WINDOW_DAYS`, 2026-08-22) et `grocery_waves`
 * datait déjà correctement l'achat de chaque article. Deux choses manquaient,
 * et elles se tiennent:
 *
 *   ① le MODÈLE ne l'a jamais su — il posait ses sessions à l'aveugle;
 *   ② la LIGNE de courses ne portait pas sa date — une liste sans jour se lit
 *     « achète tout maintenant », et c'est ce qui a été fait.
 */

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// ---------------------------------------------------------------------------
// 1. LES DURÉES NE SONT PAS RÉÉCRITES — elles sont LUES
// ---------------------------------------------------------------------------

Deno.test("chaque famille nommée pointe un groupe RÉEL du référentiel", () => {
  // ⛔ LE PIÈGE ÉVITÉ: écrire « poultry: 2 » dans la consigne créerait une
  // seconde définition du nombre, et c'est celle qu'on regarde le moins qui
  // garderait l'ancienne. Chaque famille pointe une clé de `RAW_WINDOW_DAYS`.
  for (const family of RAW_FAMILIES) {
    assert(
      Object.prototype.hasOwnProperty.call(RAW_WINDOW_DAYS, family.ref),
      `${family.ref} n'est pas un groupe du référentiel`,
    );
    assert(family.said.trim().length > 0, `${family.ref} n'a pas de mot`);
  }
});

Deno.test("les familles nommées sont celles qui MORDENT dans une semaine", () => {
  // Nommer les trente groupes ferait un tableau, c'est-à-dire une consigne
  // qu'on ne lit pas. On ne nomme que ce qui contraint un plan de sept jours.
  for (const family of RAW_FAMILIES) {
    assert(
      RAW_WINDOW_DAYS[family.ref] < WEEK.length - 1,
      `${family.ref} n'a aucune raison d'être dans la consigne`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. LE DERNIER JOUR ATTEINT — la traduction en JOURS NOMMÉS
// ---------------------------------------------------------------------------

Deno.test("un écart de 2 atteint le troisième jour, pas le deuxième", () => {
  // `2` veut dire « acheté lundi, cuisiné lundi, mardi OU mercredi » — la
  // lecture de `RAW_WINDOW_DAYS`, écrite dans son en-tête. Le dernier RANG
  // atteint est donc l'écart lui-même.
  assertEquals(lastDayReachedFromFirstShop(WEEK, 2), "wed");
  assertEquals(lastDayReachedFromFirstShop(WEEK, 1), "tue");
  assertEquals(lastDayReachedFromFirstShop(WEEK, 0), "mon");
});

Deno.test("une famille qui atteint toute la fenêtre ne dit RIEN", () => {
  // ⛔ Le silence est la bonne sortie: une contrainte qui ne mord pas, énoncée
  // quand même, apprend au modèle une règle sans objet.
  assertEquals(lastDayReachedFromFirstShop(WEEK, 6), null);
  assertEquals(lastDayReachedFromFirstShop(WEEK, 21), null);
  assertEquals(lastDayReachedFromFirstShop(["mon", "tue"], 2), null);
  assertEquals(lastDayReachedFromFirstShop([], 1), null);
});

Deno.test("la consigne NOMME des jours, jamais des durées", () => {
  const lines = rawReachLines(WEEK).join("\n");
  assertStringIncludes(lines, "fresh until tue");
  assertStringIncludes(lines, "fresh until wed");
  // ⛔ AUCUN NOMBRE DE JOURS: « la volaille tient deux jours » est la règle
  // générale qui ne mord pas — quatrième application de la leçon
  // d'`addedCookDays`.
  assert(!/\b\d+ days?\b/.test(lines), lines);
  // Et la SORTIE est dans la phrase: cuisiner tard reste permis, ça déplace la
  // course.
  assertStringIncludes(lines, "does NOT forbid");
  assertStringIncludes(lines, "bought that day or the day before");
});

Deno.test("une fenêtre courte ne dit rien du tout", () => {
  // Deux jours: aucune famille ne mord, et trois lignes de bruit seraient pires
  // que le silence.
  assertEquals(rawReachLines(["mon", "tue"]), []);
  assertEquals(rawReachLines([]), []);
});

// ---------------------------------------------------------------------------
// 3. LE CONSTAT — quelles préparations réclament leur propre course
// ---------------------------------------------------------------------------

const prep = (id: string, cookOn: string | null, groups: (string | null)[]) => ({
  id,
  cookOn,
  groups,
});

Deno.test("LE CAS RAPPORTÉ — poulet cuisiné samedi, acheté lundi", () => {
  const out = rawKeepingBreaches({
    window: WEEK,
    preparations: [prep("prep_chicken", "sat", ["poultry", "starchy_veg"])],
  });
  assertEquals(out.breaches.length, 1);
  assertEquals(out.breaches[0].group, "poultry");
  assertEquals(out.breaches[0].cookOn, "sat");
  assertEquals(out.checked, 1);
});

Deno.test("⛔ LE GROUPE LE PLUS FRAGILE DÉCIDE, pas le premier ni le dernier", () => {
  // Une préparation est aussi fragile que son ingrédient le plus fragile: la
  // pomme de terre tient deux semaines, le poulet deux jours, et c'est le
  // poulet qui décide de la date de course.
  const out = rawKeepingBreaches({
    window: WEEK,
    preparations: [prep("p", "fri", ["starchy_veg", "poultry", "legumes"])],
  });
  assertEquals(out.breaches[0].group, "poultry");
  assertEquals(out.breaches[0].windowDays, RAW_WINDOW_DAYS.poultry);
});

Deno.test("ce qui se garde ne déclenche RIEN, même en fin de semaine", () => {
  const out = rawKeepingBreaches({
    window: WEEK,
    preparations: [prep("p", "sun", ["legumes", "refined_grain", "starchy_veg"])],
  });
  assertEquals(out.breaches, []);
  assertEquals(out.checked, 1);
});

Deno.test("cuisiné TÔT, le frais tient — la garde ne mord pas d'office", () => {
  // La cicatrice « une garde a besoin d'un cas qui passe »: sans ce test, une
  // garde cassée qui refuse tout ressemblerait à une garde qui marche.
  const out = rawKeepingBreaches({
    window: WEEK,
    preparations: [prep("p", "tue", ["poultry"])],
  });
  assertEquals(out.breaches, []);
  assertEquals(out.checked, 1);
});

Deno.test("un groupe inconnu est COMPTÉ, jamais rangé d'un côté", () => {
  // ⛔ Le compter comme fragile annoncerait des courses qu'aucune donnée ne
  // réclame; comme sûr, il disparaîtrait. Même posture que `rawWindowCounts`.
  const out = rawKeepingBreaches({
    window: WEEK,
    preparations: [prep("p", "sat", [null, "banana_bread_flavoured_air"])],
  });
  assertEquals(out.breaches, []);
  assertEquals(out.checked, 0);
  assertEquals(out.unknownGroups, 2);
});

Deno.test("une cuisson qu'on ne sait pas situer sort du compte", () => {
  for (const cookOn of [null, "xxx"]) {
    const out = rawKeepingBreaches({
      window: WEEK,
      preparations: [prep("p", cookOn, ["poultry"])],
    });
    assertEquals(out.checked, 0, String(cookOn));
    assertEquals(out.breaches, [], String(cookOn));
  }
});

Deno.test("les jours à racheter sortent dans l'ordre de la FENÊTRE", () => {
  const out = rawKeepingBreaches({
    window: WEEK,
    preparations: [
      prep("a", "sun", ["poultry"]),
      prep("b", "fri", ["white_fish"]),
      prep("c", "fri", ["poultry"]),
    ],
  });
  // Dédoublonné, et dans l'ordre du plan — pas celui des préparations.
  assertEquals(daysNeedingTheirOwnShop(WEEK, out.breaches), ["fri", "sun"]);
});

// ---------------------------------------------------------------------------
// 4. LA CONSIGNE ATTEINT LE MODÈLE
// ---------------------------------------------------------------------------

const PROMPT_BASE = {
  firstDayCookable: true,
  hasFreezer: false,
  oneCookingSession: false,
  cookOnlyDay: null,
  soloBoxes: false,
  contentLocale: "en-US",
  budgetAmount: null,
  dietBlock: "",
  doctrineBlock: "== MARC'S METHOD ==",
  coachNoteBlock: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  protocolBlock: "",
  beliefKeys: [],
  goal: "health" as const,
  situation: null,
  context: null,
  mode: "to_shop" as const,
  scope: "several_days" as const,
  slot: null,
  servings: 1,
  pantry: [],
  safetyConstraints: null,
  safetyConstraintTable: null,
  body: null,
  focusAxis: null,
  daysToFill: WEEK,
  cookDays: [],
  cookingTimeMin: 60,
  kitchenEquipment: null,
};

Deno.test("PROMPT — la fenêtre crue est DITE, sous les moyens de cuisson", () => {
  const msg = buildMealPrompt({ ...PROMPT_BASE }).userMessage;
  assertStringIncludes(msg, "what a FIRST-DAY shop can still be cooked from");
  assertStringIncludes(msg, "chicken, turkey, and any minced meat: fresh until wed");
  // La place: dans le bloc qui décide d'une session, avant l'arbitrage du temps.
  const canCook = msg.indexOf("-- WHAT THEY CAN COOK --");
  const raw = msg.indexOf("what a FIRST-DAY shop");
  const thisTime = msg.indexOf("-- THIS TIME --");
  assert(canCook >= 0 && raw > canCook && raw < thisTime);
});

Deno.test("⛔ LA VEILLE COMPTE DANS CETTE RÈGLE — c'est le jour de la course", () => {
  // ══════════════════════════════════════════════════════════════════════
  // UN DÉCALAGE D'UN JOUR, DANS LE SENS PERMISSIF.
  // ══════════════════════════════════════════════════════════════════════
  //
  // La règle s'énonçait d'abord sur `daysToEat` — les jours qui portent des
  // repas —, par symétrie avec le plafond de plats. C'était faux: la « première
  // course » tombe au rang 0 de la FENÊTRE, et quand il y a une veille, c'est
  // CE jour-là qu'on achète. Compter depuis le premier jour mangé accordait une
  // journée de fraîcheur de trop.
  //
  // Fenêtre `mon..sun` dont `mon` est la veille: la volaille achetée lundi
  // tient jusqu'à MERCREDI (rang 2 de la fenêtre) — pas jusqu'à jeudi.
  const msg = buildMealPrompt({ ...PROMPT_BASE, cookOnlyDay: "mon" }).userMessage;
  assertStringIncludes(msg, "chicken, turkey, and any minced meat: fresh until wed");
  assert(!msg.includes("minced meat: fresh until thu"), msg);
});

Deno.test("PROMPT — une fenêtre de deux jours ne porte PAS le bloc", () => {
  const msg = buildMealPrompt({ ...PROMPT_BASE, daysToFill: ["mon", "tue"] })
    .userMessage;
  assert(!msg.includes("FIRST-DAY shop"));
});

Deno.test("la version de prompt a bougé avec ce lot", () => {
  assertEquals(MEAL_PROMPT_VERSION, "meal.en.v24_raw_keeping_reaches_the_model");
});

// ---------------------------------------------------------------------------
// 5. LA DATE PART AVEC LA LIGNE DE COURSES
// ---------------------------------------------------------------------------

Deno.test("LE CAS RAPPORTÉ, DE BOUT EN BOUT — le poulet n'est plus daté du lundi", () => {
  // Fenêtre lundi 2026-09-07 → dimanche, poulet cuisiné SAMEDI.
  const dates = buyDatesByIndex({
    startsOn: "2026-09-07",
    durationDays: 7,
    shoppingList: [
      { term: "chicken thighs", aisle: "protein", food_group: "poultry" },
      { term: "rice", aisle: "grains", food_group: "refined_grain" },
    ],
    preparations: [
      { id: "p", cookOn: "sat", ingredientTerms: ["chicken thighs", "rice"] },
    ],
  });
  // Samedi = 2026-09-12. Volaille: deux jours d'écart ⇒ achat le 10, pas le 7.
  assertEquals(dates[0], "2026-09-10");
  // Le riz se garde: il part avec la grosse course du premier jour.
  assertEquals(dates[1], "2026-09-07");
});

Deno.test("une ligne qu'aucune préparation ne consomme garde le premier jour", () => {
  // « Rien ne disparaît »: un terme non rattaché part en première vague, jamais
  // écarté.
  const dates = buyDatesByIndex({
    startsOn: "2026-09-07",
    durationDays: 7,
    shoppingList: [{ term: "olive oil", aisle: "other", food_group: "olive_oil" }],
    preparations: [],
  });
  assertEquals(dates, ["2026-09-07"]);
});

Deno.test("sans fenêtre lisible, aucune date n'est inventée", () => {
  const dates = buyDatesByIndex({
    startsOn: "",
    durationDays: 7,
    shoppingList: [{ term: "x", aisle: "protein", food_group: "poultry" }],
    preparations: [],
  });
  assertEquals(dates, [null]);
});

// ---------------------------------------------------------------------------
// 6. LA SOURCE — les deux lanes datent la ligne et comptent
// ---------------------------------------------------------------------------

for (
  const [name, rel] of [
    ["solo", "../../generate-meal-v1/index.ts"],
    ["foyer", "../../generate-household-meal-v1/index.ts"],
  ] as const
) {
  Deno.test(`la lane ${name} POSE la date sur chaque ligne de courses`, async () => {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    assertStringIncludes(src, "const buyDates = buyDatesByIndex({");
    assertStringIncludes(src, "buy_on: buyDates[at],");
    // ⛔ ET ELLE COMPTE, MÊME À UNE SEULE VAGUE: « une course » et « on n'a pas
    // su dater » rendent sinon le même silence.
    assertStringIncludes(src, "shopping_waves:");
  });

  Deno.test(`la lane ${name} CONSTATE la fenêtre crue et la DIT`, async () => {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    assertStringIncludes(src, "const rawKeeping = rawKeepingBreaches({");
    assertStringIncludes(src, "raw_keeping_needs_later_shop:");
    assertStringIncludes(src, "shopLaterDays: shopLaterDays as never,");
  });
}

// ---------------------------------------------------------------------------
// 7. LE REJEU — ce que la fenêtre crue dit d'un PLAN RÉEL déplacé
//
// ⛔ POURQUOI CE TEST EXISTE, ET IL N'EST PAS REDONDANT AVEC LE §3. Là-haut,
// les groupes sont écrits à la main. Ici, ce sont ceux d'un plan réellement
// composé — cinq préparations, leurs vrais termes d'ingrédients — et le lien
// terme → groupe passe par la MÊME table que le moteur.
//
// Le décor vient du run `2235786d-…` (solo, 7 jours, fenêtre jeu→mer). Tel
// quel, il est propre: tout est cuisiné jeudi, rang 0. Déplacé au lundi, la
// fenêtre crue mord — et c'est le seul endroit du dépôt où on la VOIT mordre
// sur autre chose qu'une fixture.
// ---------------------------------------------------------------------------

const REAL_WINDOW = ["thu", "fri", "sat", "sun", "mon", "tue", "wed"];

/** Les groupes réels des cinq préparations du run, tels que la liste les porte. */
const REAL_PREPS = [
  { id: "prep_thu_oat_egg_squares", groups: ["eggs", "whole_grain", "leafy_greens"] },
  { id: "prep_thu_lentil_filling", groups: ["legumes", "non_starchy_veg"] },
  { id: "prep_thu_cod_potatoes", groups: ["white_fish", "starchy_veg"] },
  { id: "prep_sat_oat_frittata", groups: ["eggs", "leafy_greens", "whole_grain"] },
  { id: "prep_sat_chickpea_ragu", groups: ["legumes", "leafy_greens", "non_starchy_veg"] },
];

Deno.test("REJEU — le plan réel, tel qu'il a été composé, est PROPRE", () => {
  // ⚠️ C'est « le cas qui passe » de cette garde, et il vient d'un vrai plan:
  // tout est cuisiné le premier jour, donc rien n'attend.
  const out = rawKeepingBreaches({
    window: REAL_WINDOW,
    preparations: REAL_PREPS.map((p) => ({ id: p.id, cookOn: "thu", groups: p.groups })),
  });
  assertEquals(out.breaches, []);
  assertEquals(out.checked, 5, "les cinq préparations doivent être EXAMINÉES");
});

Deno.test("REJEU — la MÊME cuisson au lundi fait mordre quatre préparations", () => {
  const out = rawKeepingBreaches({
    window: REAL_WINDOW,
    preparations: REAL_PREPS.map((p) => ({ id: p.id, cookOn: "mon", groups: p.groups })),
  });
  assertEquals(out.checked, 5);
  // Le cabillaud (1 jour) et les trois qui portent de la feuille (3 jours).
  assertEquals(out.breaches.length, 4);
  const cod = out.breaches.find((b) => b.preparationId === "prep_thu_cod_potatoes");
  assert(cod, "le cabillaud doit mordre");
  assertEquals(cod?.group, "white_fish");
  assertEquals(cod?.cookAt, 4);
  // Les lentilles en conserve tiennent trois semaines: elles ne mordent pas.
  assert(!out.breaches.some((b) => b.preparationId === "prep_thu_lentil_filling"));
  assertEquals(daysNeedingTheirOwnShop(REAL_WINDOW, out.breaches), ["mon"]);
});

Deno.test("REJEU — LE DÉFAUT RAPPORTÉ, PRIS PAR LA DATE D'ACHAT", () => {
  // ══════════════════════════════════════════════════════════════════════
  // « ça me disait de cuisiner le poulet acheté le lundi, le samedi »
  // ══════════════════════════════════════════════════════════════════════
  //
  // Ici c'est du cabillaud et le décalage est l'inverse, mais c'est le même
  // fait: un frais fragile daté du PREMIER jour du plan pour une cuisson
  // lointaine. Avec la cuisson au lundi, il est daté de la veille.
  const shoppingList = [
    { term: "cod fillets", aisle: "protein", food_group: "white_fish" },
    { term: "tinned tuna", aisle: "pantry", food_group: "white_fish" },
    { term: "potatoes", aisle: "produce", food_group: "starchy_veg" },
  ];
  const preparations = [
    { id: "p", cookOn: "mon", ingredientTerms: ["cod fillets", "potatoes"] },
  ];
  const dates = buyDatesByIndex({
    startsOn: "2026-09-03",
    durationDays: 7,
    shoppingList,
    preparations,
  });
  // Lundi = 2026-09-07. Le poisson tient un jour ⇒ acheté le 6, pas le 3.
  assertEquals(dates[0], "2026-09-06");
  // ⚠️ LE THON EN BOÎTE RESTE AU PREMIER JOUR, et ce n'est pas une faute: son
  // RAYON n'est pas périssable. Les deux signaux se combinent — le groupe porte
  // la fenêtre, le rayon dit si la question se pose.
  assertEquals(dates[1], "2026-09-03");
  // La pomme de terre tient deux semaines: première vague.
  assertEquals(dates[2], "2026-09-03");
});
