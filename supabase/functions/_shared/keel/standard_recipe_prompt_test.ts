/**
 * v33 · « ÉCRIS UNE RECETTE, PAS UNE PORTION » — le prompt du lot 3.
 *
 * Chantier: `docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md`.
 *
 * ⛔ CE FICHIER TIENT LES DEUX MOITIÉS D'UNE MÊME PROPRIÉTÉ:
 *   ① sous `portion_v1`, le prompt DIT la recette standard et ne dit PLUS le
 *      corps ni les boîtes;
 *   ② sous `legacy_measure`, il est OCTET-IDENTIQUE à v32 — épinglé par une
 *      empreinte SHA-256 sur trois foyers canoniques.
 *
 * La seconde est la plus importante. Sans elle, « le chemin neuf est précédé,
 * jamais substitué » serait une intention plutôt qu'un fait, et un foyer de
 * quatre personnes découvrirait le changement dans son assiette.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildHouseholdPromptBlocks,
  HOUSEHOLD_PROMPT_VERSION,
  LIGHT_DISH_MIN_KCAL_PER_100G,
  NORMAL_DISH_MIN_KCAL_PER_100G,
  STANDARD_RECIPE_BLOCK,
  standardRecipeBlock,
} from "./household_meal_generation.ts";
import type { SideCourseAsk } from "./side_courses_types.ts";
import {
  buildPortionBrief,
  densityFloorsOf,
  type PortionMember,
} from "./household_portions.ts";
import type { RequiredDensity } from "./portion_sizing.ts";
import { parseMemberAway, resolveWindowPresence } from "./household_presence.ts";
import type { MealBodyContext } from "./meal_body.ts";

const NOBODY_AWAY = resolveWindowPresence({
  members: [
    { memberId: "m-solo", displayName: "Alex", away: parseMemberAway([]) },
    { memberId: "m-two", displayName: "Bea", away: parseMemberAway([]) },
    { memberId: "m-kid", displayName: "Léa", away: parseMemberAway([]) },
    { memberId: "m-four", displayName: "Cy", away: parseMemberAway([]) },
  ],
  rhythm: [
    { slot: "breakfast", size: null },
    { slot: "lunch", size: null },
    { slot: "dinner", size: null },
  ],
  windowDays: ["mon", "tue"],
});

const BODY: MealBodyContext = {
  heightCm: 170,
  ageBand: "30_44",
  gender: "male",
  latestWeight: { weekStart: "2026-08-31", value: 70 },
  declaredWeightKg: null,
  latestWaist: null,
  restrictionFlag: false,
};

function member(over: Partial<PortionMember> & { memberId: string }): PortionMember {
  return {
    displayName: "Alex",
    goal: "maintenance",
    ageState: "adult",
    body: BODY,
    lightSlots: [],
    eatingSlots: null,
    habits: [],
    habitNote: null,
    requiredDensity: null,
    proteinBrief: null,
    ...over,
  };
}
const SOLO = member({
  memberId: "m-solo",
  eatingSlots: [
    { slot: "breakfast", size: null },
    { slot: "lunch", size: null },
    { slot: "snack_pm", size: null },
    { slot: "dinner", size: null },
  ],
  lightSlots: ["dinner"],
});

function blocks(over: Record<string, unknown>) {
  return buildHouseholdPromptBlocks({
    sizingPath: "legacy_measure" as const,
    ruleHolders: [],
    traditions: [],
    daysInWindow: ["mon", "tue"],
    members: [SOLO],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: null,
    unmerge: null,
    cooking: "one_dish" as const,
    divergingCount: 0,
    weightGroups: 1,
    dishBearers: [],
    dedicatedDishesAsked: 0,
    medicalMouths: [],
    crossContactUnnamedMedical: 0,
    kitchenEquipment: null,
    dietBlock: "",
    notes: [],
    voices: [],
    ...over,
    // deno-lint-ignore no-explicit-any
  } as any);
}

// ═══════════════════════════════════════════════════════════════════════════
// ① CE QUE LE PROMPT DIT SOUS `portion_v1`
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("v33 — le prompt DEMANDE une recette standard, planchers compris", () => {
  const { userSuffix } = blocks({ sizingPath: "portion_v1" });
  assert(userSuffix.includes("ONE standard recipe"), "la consigne est servie");
  assert(
    userSuffix.includes(`${NORMAL_DISH_MIN_KCAL_PER_100G} kcal per 100 g`),
    "le plancher ordinaire porte le nombre ÉPINGLÉ, jamais un littéral recopié",
  );
  assert(
    userSuffix.includes(`${LIGHT_DISH_MIN_KCAL_PER_100G} kcal`),
    "le plancher léger aussi",
  );
  // ⛔ L'ÉCHAPPATOIRE NOMMÉE. « écris une recette standard » sans dire ce qu'on
  // refuse se fait satisfaire par « une portion standard pour Alex ».
  assert(userSuffix.includes("never a box"), "l'interdit des boîtes est littéral");
  assert(userSuffix.includes("never a per-person"), "l'interdit du par-personne aussi");
});

Deno.test("v33 — le CORPS ne part plus au modèle", () => {
  const { userSuffix, systemSuffix } = blocks({ sizingPath: "portion_v1" });
  const tout = `${systemSuffix}\n${userSuffix}`;
  // ⛔ LA SIGNATURE EXACTE DU BRIEF, pas des mots. Un `\bweight \b` attrapait
  // trois phrases de prose du système (« that weight moves to the protein
  // food ») — mesuré au tir BASE du 2026-09-07.
  assertEquals(
    tout.match(/\[height \d+ cm|age band \d|weight \d+(?:[.,]\d+)? kg/g),
    null,
    "aucun fait de corps ne doit atteindre le modèle sous portion_v1",
  );
  // Et la contre-épreuve: sous `legacy_measure`, il y est.
  const legacy = blocks({ sizingPath: "legacy_measure" });
  assert(
    /\[height \d+ cm/.test(`${legacy.systemSuffix}\n${legacy.userSuffix}`),
    "sinon ce test passerait sur un prompt vide",
  );
});

Deno.test("v33 — le créneau LÉGER est marqué, et la taille ne l'est plus", () => {
  const { userSuffix } = blocks({ sizingPath: "portion_v1" });
  assert(
    userSuffix.includes("dinner (light)"),
    "le moment marqué porte (light) sur SA ligne",
  );
  // ⛔ MODE D'ÉCHEC N°6 DU PLAN: « léger » compté deux fois. Le poids du moment
  // porte déjà l'information; l'écrire aussi en mots ferait rétrécir le dîner
  // une seconde fois.
  assert(!userSuffix.includes("for them)"), "aucune taille déclarée ne se rend");
  // ⚠️ DEUX OCCURRENCES, ET C'EST JUSTE: une sur la LIGNE de la personne
  // (« dinner (light) ») et une dans la CONSIGNE, qui explique ce que le
  // marqueur demande (« A slot marked (light) calls for a light recipe »).
  // La consigne sans le marqueur apprendrait au modèle qu'un marquage existe
  // et l'inviterait à en inventer un; le marqueur sans la consigne serait un
  // mot que rien ne définit.
  assertEquals(userSuffix.split("(light)").length - 1, 2);
  assert(userSuffix.includes("A slot marked (light)"), "la consigne définit le marqueur");
  // Et un seul MOMENT est marqué sur la ligne, pas les quatre.
  const ligne = userSuffix.split("\n").find((l) => l.startsWith("- Alex:"))!;
  assertEquals(ligne.split("(light)").length - 1, 1);
});

Deno.test("v33 — AUCUN kcal ne fuit, sauf une DENSITÉ", () => {
  // ⛔ C'EST LA GARDE DU CHANTIER ENTIER. Le modèle n'a plus le corps de
  // personne; lui donner un nombre de calories rouvrirait la porte par
  // l'autre bout, et le plancher TCA (lot 6) en dépend aussi.
  //
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-08 — LA LISTE BLANCHE DEVIENT UNE FORME. Elle nommait deux
  // NOMBRES (100 et 60); le lot de la densité en fait entrer d'autres, tous
  // calculés. Épingler des valeurs aurait forcé à rouvrir cette garde à
  // chaque tir — et une garde qu'on rouvre souvent finit rouverte.
  //
  // ⛔ CE QUI EST AUTORISÉ EST LA FORME « N kcal per 100 g », ET RIEN
  // D'AUTRE. C'est la seule qui décrive un PLAT: une densité est une
  // propriété de ce qu'il y a dans la casserole. « 3180 kcal », « 1156 kcal
  // at lunch », « 2000 kcal a day » décrivent une PERSONNE, et aucune ne
  // passe. Le test le prouve dans les deux sens, juste en dessous.
  // ══════════════════════════════════════════════════════════════════════
  const { userSuffix, systemSuffix } = blocks({ sizingPath: "portion_v1" });
  const tout = `${systemSuffix}\n${userSuffix}`;
  assertEquals(
    tout.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/gi) ?? [],
    [],
    "des kcal atteignent le modèle sans être une densité",
  );
  // Et les deux planchers de base sont toujours là, sous leur forme de densité.
  assert(tout.includes(`${NORMAL_DISH_MIN_KCAL_PER_100G} kcal per 100 g`));
  assert(tout.includes(`${LIGHT_DISH_MIN_KCAL_PER_100G} kcal`));
});

Deno.test("v33 — la garde de fuite REFUSE un kcal qui n'est pas une densité", () => {
  // ⛔ UNE GARDE A BESOIN D'UN CAS QUI PASSE ET D'UN CAS QUI MORD. Réécrire
  // l'expression au-dessus sans ce test aurait pu la desserrer en silence: un
  // `(?!…)` mal placé accepte tout. On lui donne donc les deux textes.
  const mord = /\d+\s*kcal(?!\s*per\s*100\s*g)/gi;
  for (const bon of [
    "at least 182 kcal per 100 g at lunch",
    "carries at least 100 kcal per 100 g as served",
  ]) {
    assertEquals(bon.match(mord) ?? [], [], `« ${bon} » est une densité`);
  }
  for (const mauvais of [
    "you are aiming for 3180 kcal a day",
    "lunch is 1156 kcal",
    "1156 kcal per day",
  ]) {
    assert((mauvais.match(mord) ?? []).length > 0, `« ${mauvais} » doit être refusé`);
  }
});

Deno.test("v33 — aucun protocole de boîte ne part au modèle", () => {
  const { userSuffix, systemSuffix } = blocks({ sizingPath: "portion_v1" });
  const tout = `${systemSuffix}\n${userSuffix}`;
  for (const interdit of ["ONE BOX PER GROUP", "THE MEMBER IDS", "box lids"]) {
    assert(!tout.includes(interdit), `« ${interdit} » ne doit pas être servi`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ② L'IDENTITÉ À N ≥ 2 — l'empreinte
// ═══════════════════════════════════════════════════════════════════════════

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const DEUX = [member({ memberId: "m-solo" }), member({ memberId: "m-two", displayName: "Bea" })];
const DEUX_OBJECTIF = [
  member({ memberId: "m-solo" }),
  member({ memberId: "m-two", displayName: "Bea", goal: "fat_loss" }),
];
const QUATRE = [
  ...DEUX_OBJECTIF,
  member({ memberId: "m-kid", displayName: "Léa", goal: null, ageState: "minor" }),
  member({ memberId: "m-four", displayName: "Cy" }),
];

Deno.test("⛔ IDENTITÉ — le prompt de trois foyers N ≥ 2 est ÉPINGLÉ à l'octet", async () => {
  // ⛔ POURQUOI UNE EMPREINTE ET PAS DES `includes`. Le lot 3 touche le brief de
  // portions, que TOUS les foyers lisent. Des assertions de contenu diraient
  // « la phrase X est toujours là »; seule une empreinte dit « rien n'a bougé ».
  // Un foyer de quatre personnes ne doit pas découvrir ce chantier dans son
  // assiette.
  //
  // ⚠️ QUAND CE TEST ROUGIT, LA QUESTION EST « QUI A BOUGÉ », pas « quelle est
  // la nouvelle empreinte ». Si le changement est voulu ET destiné à tous les
  // foyers, on remplace; s'il ne l'est pas, c'est une fuite de `portion_v1`
  // dans la lane commune.
  const empreintes = {
    deux: await sha256(blocks({ members: DEUX }).userSuffix),
    deux_objectif: await sha256(blocks({ members: DEUX_OBJECTIF, weightGroups: 2 }).userSuffix),
    quatre: await sha256(blocks({ members: QUATRE, weightGroups: 2 }).userSuffix),
  };
  // ⛔ CES TROIS VALEURS NE SONT PAS « CE QUE LE CODE REND AUJOURD'HUI ».
  // Elles ont été calculées le 2026-09-07 contre les versions **HEAD** de
  // `household_portions.ts` et `household_meal_generation.ts` — c'est-à-dire
  // contre le code d'AVANT le lot 3 — posées côte à côte dans le même
  // répertoire et importées par un script jetable. Les trois coïncident au
  // caractère près avec ce que le code d'après rend sous `legacy_measure`.
  //
  // ⚠️ SANS CETTE VÉRIFICATION, ÉPINGLER AURAIT ÉTÉ UN GESTE VIDE: on aurait
  // gravé son propre changement en croyant graver l'identité. C'est la
  // différence entre « le test passe » et « le test dit quelque chose ».
  // ⟳ 2026-09-25 — LES TROIS REMPLACÉES, ET LA QUESTION « QUI A BOUGÉ » A SA
  // RÉPONSE: la première ligne du brief (« one cooking session » → « the same
  // dishes for the whole table », v46), destinée à tous les foyers. Vérifié
  // avant de remplacer: en remettant l'ancienne ligne dans le texte d'après,
  // on retrouve les trois empreintes d'avant au caractère près (a298e286…,
  // a7c77b2b…, a13bf0c6…) — aucune autre ligne n'a bougé.
  assertEquals(empreintes, {
    deux: "4bf419b6f8dab15d9efa01b1c9bac0e895ed21cd62506f75abd00fb95f4dcf6e",
    deux_objectif: "f258118d2edc43cf5d425db0e300171fa9946d230cd4c5396acfe305364f38a0",
    quatre: "860c5899ad2f4006502dfa343a8f465ab2121e7ed87b6e8ccb7e427b5f768fcb",
  });
});

Deno.test("IDENTITÉ — `legacy_measure` est le DÉFAUT de forme, à toute taille", () => {
  for (const membres of [DEUX, DEUX_OBJECTIF, QUATRE]) {
    const { userSuffix } = blocks({ members: membres, weightGroups: 2 });
    assert(
      !userSuffix.includes("ONE standard recipe"),
      "la consigne v33 ne doit atteindre AUCUN foyer à plusieurs bouches",
    );
  }
});

Deno.test("la version dit le lot, et l'arbitrage l'a suivie", () => {
  // ⟳ 2026-09-23 — v37: la recette de référence et le plat qui n'est plus tout
  // le repas (voir le ④ en fin de fichier).
  // ⟳ 2026-09-23 — v38: le féculent à part pour tout déjeuner et tout dîner,
  // seul ou partagé (voir le ⑥ en fin de fichier).
  // ⟳ 2026-09-23 — v39: les à-côtés en familles (`side_courses_prompt.ts`).
  // ⟳ 2026-09-23 — v40: la table partage ses à-côtés (`side_courses_prompt.ts`).
  assertEquals(HOUSEHOLD_PROMPT_VERSION, "v48_off_the_table_not_at");
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA DENSITÉ REQUISE SUR LA LIGNE — 2026-09-08
// ═══════════════════════════════════════════════════════════════════════════

/** Ce que `requiredDensityFor` rend pour le corps du tir du 2026-09-07. */
const DENSITE_GRAND: RequiredDensity = {
  named: [
    { slot: "breakfast", days: ["mon"], kcalPer100G: 126, minPer100G: 126, maxPer100G: 250, preferredPer100G: 139, neededMinPer100G: 126, incompatible: null,
    redundantMin: false,
    // ⟳ 2026-09-11 — pas de témoin `100 × E / Gpréf` dans ce décor: il tient le
    // rendu d'UN seul nombre, le cas nominal. Le cas à deux nombres est dans
    // `first_draft_contract_test.ts`.
    targetAnchoredPer100G: null,
    occurrences: 1, light: false },
    { slot: "lunch", days: ["mon"], kcalPer100G: 201, minPer100G: 201, maxPer100G: 250, preferredPer100G: 222, neededMinPer100G: 201, incompatible: null,
    redundantMin: false,
    // ⟳ 2026-09-11 — pas de témoin `100 × E / Gpréf` dans ce décor: il tient le
    // rendu d'UN seul nombre, le cas nominal. Le cas à deux nombres est dans
    // `first_draft_contract_test.ts`.
    targetAnchoredPer100G: null,
    occurrences: 1, light: false },
    { slot: "dinner", days: ["mon"], kcalPer100G: 176, minPer100G: 176, maxPer100G: 250, preferredPer100G: 194, neededMinPer100G: 176, incompatible: null,
    redundantMin: false,
    // ⟳ 2026-09-11 — pas de témoin `100 × E / Gpréf` dans ce décor: il tient le
    // rendu d'UN seul nombre, le cas nominal. Le cas à deux nombres est dans
    // `first_draft_contract_test.ts`.
    targetAnchoredPer100G: null,
    occurrences: 1, light: false },
  ],
  floorOnly: [],
  reason: "anchored",
  gapClosed: "none",
  counters: {
    slots: 4,
    above_floor: 3,
    below_floor: 0,
    days_varied: 0,
    capped: 0,
    fixed_covered: 0,
    floor_min_kept: 0,
    empty_intersection: 0,
    relaxed_days: 0,
    relax_refused: {},
  },
};

/** Une bouche sous plancher TCA: son exigence ne peut PAS être nommée. */
const DENSITE_SOUS_PLANCHER: RequiredDensity = {
  named: [],
  floorOnly: [{ slot: "lunch", days: ["mon"], kcalPer100G: 165, minPer100G: 165, maxPer100G: 165, preferredPer100G: 165, neededMinPer100G: 165, incompatible: null,
    redundantMin: false,
    // ⟳ 2026-09-11 — sans témoin: sous plancher TCA, RIEN ne se dit en face du
    // nom de cette personne, donc surtout pas un second nombre.
    targetAnchoredPer100G: null,
    occurrences: 1, light: false }],
  reason: "anchored",
  gapClosed: "restriction_floor",
  counters: {
    slots: 3,
    above_floor: 1,
    below_floor: 0,
    days_varied: 0,
    capped: 0,
    fixed_covered: 0,
    floor_min_kept: 0,
    empty_intersection: 0,
    relaxed_days: 0,
    relax_refused: {},
  },
};

Deno.test("v33 — la densité requise se dit sur la ligne, comme un fait sur le PLAT", () => {
  const { userSuffix } = blocks({
    sizingPath: "portion_v1",
    members: [member({ memberId: "m-solo", requiredDensity: DENSITE_GRAND })],
  });
  const ligne = userSuffix.split("\n").find((l) => l.startsWith("- Alex:"))!;
  // ⛔ LA FORMULE EST LA GARDE. « dishes served here » décrit une casserole;
  // « Alex needs 201 kcal » décrirait quelqu'un — et v33 lui a retiré le corps
  // de tout le monde exprès.
  // ⟳ 2026-09-10 — LA LIGNE DIT UN COULOIR, PLUS « au moins N ». Un seul bout
  // laisse le modèle partir de l'autre côté, et les deux sens ont été mesurés:
  // 23 densités sur 40 sont revenues AU-DESSUS de la consigne (jusqu'à +63 %),
  // et la consigne inverse (« reste sous N », sans plancher) a rendu un bouillon
  // à 57,8. La visée est dite, et elle est À L'INTÉRIEUR.
  assert(
    ligne.includes(
      "— dishes served here: 126 to 250 kcal per 100 g at breakfast (aim 139), " +
        "201 to 250 at lunch (aim 222), 176 to 250 at dinner (aim 194)",
    ),
    ligne,
  );
  // ⛔ ET LA GARDE DE FORME TIENT SUR LA NOUVELLE PHRASE: aucun `kcal` de la
  // ligne n'échappe à `per 100 g`. Sans cette ligne, écrire « 201 kcal to 250
  // kcal » passerait le test au-dessus et rouvrirait la fuite.
  assertEquals(ligne.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/g), null, ligne);
  assert(!ligne.includes("Alex needs"), "jamais un fait sur la personne");
  // Et la conséquence est servie une fois, parce qu'une ligne la porte.
  assert(userSuffix.includes("A density on someone's line is a fact about the DISH"));
});

Deno.test("v33 — sans densité, RIEN n'est écrit et la conséquence ne part pas", () => {
  // ⛔ MÊME DISCIPLINE QUE `anyRhythm`/`anyHabit`: une consigne « quand une
  // ligne porte une densité… » servie à un foyer où personne n'en porte apprend
  // au modèle qu'une telle grandeur existe, et l'invite à en inventer une.
  const { userSuffix } = blocks({ sizingPath: "portion_v1" });
  assert(!userSuffix.includes("dishes served here"));
  assert(!userSuffix.includes("A density on someone's line"));
});

Deno.test("⛔ v33 — SOUS PLANCHER TCA, la ligne est MUETTE et le plancher MONTE", () => {
  const { userSuffix } = blocks({
    sizingPath: "portion_v1",
    members: [member({ memberId: "m-solo", requiredDensity: DENSITE_SOUS_PLANCHER })],
  });
  const ligne = userSuffix.split("\n").find((l) => l.startsWith("- Alex:"))!;
  assert(!ligne.includes("dishes served here"), ligne);
  assert(!ligne.includes("165"), "son chiffre n'apparaît nulle part en face d'elle");
  // ⛔ MAIS SON EXIGENCE ATTEINT LE MODÈLE, par le plancher commun du bloc: la
  // protéger d'un chiffre ne doit pas la sous-nourrir.
  assert(
    userSuffix.includes("at least 165 kcal per 100 g as served"),
    "le plancher du bloc a monté à 165",
  );
  assert(
    !userSuffix.includes(`at least ${NORMAL_DISH_MIN_KCAL_PER_100G} kcal per 100 g as served`),
    "et il ne dit plus 100",
  );
});

Deno.test("le plancher du bloc ne suit QUE ce qu'on ne peut pas nommer", () => {
  // ⛔ LA MOITIÉ QUI SE TROMPERAIT SEULE. Faire monter le plancher commun avec
  // une densité NOMMÉE imposerait au petit-déjeuner de tout le foyer la densité
  // du déjeuner de la plus exigeante — 201 au lieu de 126, sur un moment qui
  // n'en avait aucun besoin.
  const base = { normal: NORMAL_DISH_MIN_KCAL_PER_100G, light: LIGHT_DISH_MIN_KCAL_PER_100G };
  assertEquals(
    densityFloorsOf([member({ memberId: "m", requiredDensity: DENSITE_GRAND })], base),
    base,
    "trois densités NOMMÉES, et le plancher ne bouge pas",
  );
  assertEquals(
    densityFloorsOf([member({ memberId: "m", requiredDensity: DENSITE_SOUS_PLANCHER })], base),
    { normal: 165, light: LIGHT_DISH_MIN_KCAL_PER_100G },
    "une densité anonyme, et le plancher NORMAL monte — le léger ne bouge pas",
  );
  assertEquals(densityFloorsOf([member({ memberId: "m" })], base), base, "aucune densité");
});

Deno.test("⛔ IDENTITÉ — la densité ne traverse PAS vers `legacy_measure`", () => {
  // ⛔ CE TEST EST LE SEUL GARDIEN DE CETTE FUITE, ET LA MUTATION L'A PROUVÉ.
  //
  // On croyait l'empreinte SHA-256 plus haut suffisante. Elle ne l'est PAS:
  // ses trois foyers canoniques portent `requiredDensity: null`, donc la ligne
  // reste vide chez eux même quand le gate `portion_v1` disparaît. Mesuré le
  // 2026-09-08 en retirant le gate: l'empreinte reste VERTE, et seule cette
  // assertion rougit.
  //
  // ⚠️ C'est le patron « une garde a besoin d'un cas qui passe »: une empreinte
  // ne protège que ce que ses fixtures portent. Donner une densité à une bouche
  // de la lane legacy est la seule façon de demander « et si elle en avait
  // une ? ».
  const { userSuffix } = blocks({
    members: [member({ memberId: "m-solo", requiredDensity: DENSITE_GRAND })],
  });
  assert(!userSuffix.includes("dishes served here"));
  assert(!userSuffix.includes("201"));
});

Deno.test("⛔ LA MÉTHODE DE CALCUL EST DITE, ET LA TABLE AVEC — 2026-09-10", () => {
  // ⛔ LE DÉFAUT MESURÉ: le modèle ne calculait pas, il devinait. Sur 40
  // densités demandées puis mesurées (`qa-genty-clone`, 2026-09-09/10), l'écart
  // entre la consigne et la recette rendue allait de −23 % à +63 %; médiane
  // +3,1 %, 17 en dessous, 23 au-dessus. Une médiane juste avec cette amplitude
  // est la signature d'un tirage au sort — et une marge ne répare pas une
  // dispersion, elle déplace un centre qui était déjà bon.
  const bloc = STANDARD_RECIPE_BLOCK.join("\n");
  // ⛔ CIQUAL EST NOTRE SOURCE, PAS UNE RÉFÉRENCE DE CONFORT:
  // `food_composition_refs` porte 881 lignes `ciqual` sur 943. Le modèle et le
  // moteur pèsent enfin avec la même table.
  assert(bloc.includes("CIQUAL"), "la table est nommée");
  assert(/ANSES/.test(bloc), "et son autorité, pour lever l'ambiguïté");
  // ⛔ « AS SERVED » NE SUFFISAIT PAS. 100 g de riz sec font 350 kcal/100 g;
  // cuits, 130. Un calcul posé sur le cru rend une recette qui se croit dense.
  assert(bloc.includes("COOKED"), "le poids est dit CUIT, en toutes lettres");
  assert(bloc.includes("Dry rice is 350"), "avec l'exemple qui le rend concret");
  // La formule, écrite, pas sous-entendue.
  assert(bloc.includes("density = (total kcal) ÷ (total cooked grams) × 100."));
  // ⛔ ET IL DOIT POSER SON RÉSULTAT: écrire un nombre force à le calculer.
  assert(bloc.includes('"density_check"'), "le champ est demandé");
  assert(
    bloc.includes("Do not answer with a dish you"),
    "et la consigne dit de corriger AVANT de répondre, pas de compter sur la relance",
  );
  // ⚠️ LA GARDE DE FUITE TIENT TOUJOURS: la méthode parle de kcal par 100 g et
  // d'un exemple de table, jamais d'une cible de journée ni d'un poids.
  // ⚠️ « 350 kcal per 100 g » N'EST PAS UNE FUITE, et c'est pour ça que la garde
  // regarde ce qui SUIT le nombre. Une densité est une propriété de l'aliment;
  // une cible de journée est une propriété de la personne. Seule la seconde est
  // interdite ici, et l'exemple du riz sec ne la porte pas.
  assertEquals(bloc.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/gi), null);
  assertEquals(bloc.match(/\bkg\b/gi), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ ⟳ 2026-09-23 — LA RECETTE DE RÉFÉRENCE, ET LE PLAT QUI N'EST PLUS TOUT LE
//    REPAS (audit `docs/keel/AUDIT-DOSAGES-2026-09-23.md`)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CES CAS PROUVENT, ET CE QU'ILS NE PROUVENT PAS. Aucun appel modèle:
// ils tiennent que la consigne CONTIENT la part de référence et ne contient
// PLUS les phrases qui envoyaient au féculent. L'effet sur une assiette rendue
// se mesure à la campagne (vague 4), pas ici.

/** L'index de la LIGNE qui contient `needle`, ou −1. */
function lineOf(lines: readonly string[], needle: string): number {
  return lines.findIndex((l) => l.includes(needle));
}

Deno.test("④ LA PART DE RÉFÉRENCE est écrite en grammes, pour la personne du MILIEU", () => {
  const bloc = STANDARD_RECIPE_BLOCK.join("\n");
  assert(bloc.includes("THE TEMPLATE: one serving is the ordinary plate of the person in the MIDDLE"));
  assert(bloc.includes("never the biggest eater's"), "l'échappatoire est nommée");
  // La casserole principale.
  assert(bloc.includes("110 to 130 g of lean protein, raw (tofu 100 to\n    150 g)"), bloc);
  assert(bloc.includes("180 to 200 g of vegetables, 10 ml of oil, at most 15 g of cheese"), bloc);
  // Le petit-déjeuner, et la protéine là où elle est vraiment.
  assert(bloc.includes("50 to 60 g of oat flakes or muesli; 125 g of skyr"), bloc);
  assert(bloc.includes("or fromage blanc, or 200 ml of milk; one fruit of 100 to 120 g; 15 to 20 g"));
  assert(bloc.includes("at most 2 eggs"));
  assert(bloc.includes("Skyr and fromage blanc carry the protein;"));
  assert(bloc.includes("greek yogurt does not"), "le « greek yogurt » du référentiel est entier");
  assert(bloc.includes("A frittata with 300 g\n    of tomato per serving is not a breakfast."));
  // ⛔ LA GARDE DE FUITE: des grammes, jamais un kcal qui ne soit une densité.
  assertEquals(bloc.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/gi), null);
});

Deno.test("④ ⛔ LE FÉCULENT DE RÉFÉRENCE EST DANS LA PHRASE DE `separable_side` (4 lignes au plus)", () => {
  // « La promesse et la clé de schéma doivent se toucher »: la part de féculent
  // dite loin de la clé qui la porte serait suivie à 0 %.
  const lines = STANDARD_RECIPE_BLOCK;
  const key = lineOf(lines, 'role "separable_side"');
  const grain = lineOf(lines, "60 to 70 g of dry");
  const potato = lineOf(lines, "220 to 250 g of potatoes");
  const bread = lineOf(lines, "80 to 90 g of bread -- never more");
  assert(key >= 0 && grain >= 0 && potato >= 0 && bread >= 0, lines.join("\n"));
  for (const [nom, at] of [["céréale", grain], ["pomme de terre", potato], ["pain", bread]] as const) {
    assert(at >= key && at - key <= 3, `${nom} à ${at - key} lignes de la clé`);
  }
  const bloc = lines.join("\n");
  assert(bloc.includes("(never at a table where a card says muscle\ngain)"), "la pomme de terre a sa garde");
  // ⚠️ LE MODÈLE VÉRIFIE PAR LA DIVISION QU'IL FAIT DÉJÀ À L'ÉTAPE 1.
  assert(bloc.includes('divide each pot by its\n"servings_made"; one serving must land in THE TEMPLATE.'));
});

Deno.test("④ ⛔ LES PHRASES QUI POUSSAIENT AU FÉCULENT SONT PARTIES — et leurs remplaçantes sont là", () => {
  for (const served of [true, false]) {
    const bloc = standardRecipeBlock({ normal: 100, light: 60 }, { served }).join("\n");
    // ── ce qui MORD: chacune a été servie jusqu'au 2026-09-22 ──────────────
    for (
      const gone of [
        "Reach the density with the starch",
        "energy of a plate comes from the starch",
        "SMALLEST serving",
        "aim 200 g per serving",
        "There is no starter: the dish is the unit",
        "more starch, protein",
      ]
    ) {
      assert(!bloc.replace(/\n/g, " ").includes(gone), `« ${gone} » est revenu (served=${served})`);
    }
    // ── ce qui PASSE: les gestes de remplacement ────────────────────────────
    assert(bloc.includes("Reach the density with what THE\nTEMPLATE gives"), bloc);
    assert(bloc.includes("never a bigger piece to reach a density"), bloc);
    assert(
      bloc.includes(
        "less cooking water, legumes in the main pot or 10 g\n    more cheese; never more starch than THE TEMPLATE, never fewer vegetables;",
      ),
      bloc,
    );
    assert(bloc.includes("Never add a dessert, bread or a starter to a dish"), bloc);
  }
});

Deno.test("④ LE RENVOI « (SIDE COURSES) » N'EST ÉCRIT QUE SI LE BLOC L'EST", () => {
  // ⛔ Cicatrice du « ci-dessus » qui ne pointe nulle part: la phrase renvoie à
  // un bloc; servie sans lui, elle renverrait dans le vide.
  const avec = standardRecipeBlock({ normal: 100, light: 60 }, { served: true }).join("\n");
  const sans = standardRecipeBlock({ normal: 100, light: 60 }, { served: false }).join("\n");
  assert(avec.includes(
    "The dish is not the whole meal: the app serves a side course beside it (SIDE COURSES). Never add a dessert, bread or a starter to a dish.",
  ));
  assert(!sans.includes("SIDE COURSES"), sans);
  assert(!sans.includes("side course"), sans);
  // La forme canonique est celle qui sert les à-côtés.
  assertEquals(STANDARD_RECIPE_BLOCK.join("\n"), avec);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ ⟳ 2026-09-23 — v33 (PERSONNE SEULE): LES À-CÔTÉS, UNE LIGNE PAR JOUR
// ═══════════════════════════════════════════════════════════════════════════

function ask(over: Partial<SideCourseAsk> & { dayToken: string; slot: "lunch" | "dinner" }): SideCourseAsk {
  return {
    memberId: "m-solo",
    dayIndex: over.dayToken === "mon" ? 0 : 1,
    goal: "fat_loss",
    courses: [{ kind: "starter", kcal: 60, proteinEstG: 1.5 }, { kind: "dessert", kcal: 80, proteinEstG: 0.8 }],
    ...over,
  };
}

Deno.test("⑤ v33 — la répartition est dans le bloc, UNE LIGNE PAR JOUR, et elle est comptée", () => {
  const asks = [
    ask({ dayToken: "tue", slot: "dinner", courses: [{ kind: "dessert", kcal: 80, proteinEstG: 0.8 }] }),
    ask({ dayToken: "mon", slot: "dinner", courses: [{ kind: "starter", kcal: 60, proteinEstG: 1.5 }] }),
    ask({ dayToken: "mon", slot: "lunch" }),
    ask({ dayToken: "tue", slot: "lunch" }),
  ];
  const b = blocks({ sizingPath: "portion_v1", sideCourses: asks });
  const u = b.userSuffix;
  assert(u.includes("== SIDE COURSES (household): ONE FOOD BESIDE THE DISH =="), u);
  // L'ordre de la fenêtre, puis déjeuner avant dîner — jamais l'ordre d'arrivée.
  assert(u.includes("- mon: lunch — Alex starter + dessert; dinner — Alex starter."), u);
  assert(u.includes("- tue: lunch — Alex starter + dessert; dinner — Alex dessert."), u);
  assert(u.indexOf("- mon:") < u.indexOf("- tue:"));
  // ⛔ LE COMPTEUR COMPENSE LE CHAMP OPTIONNEL — tous présents.
  assertEquals(b.sideCourses, { given: 6, prompt_asked: 6, cells: 4, unplaced: 0 });
  // La recette renvoie au bloc, et le bloc la suit.
  assert(u.includes("(SIDE COURSES). Never add a dessert"), "le renvoi est servi");
  assert(u.indexOf("WRITE ONE STANDARD RECIPE PER DISH") < u.indexOf("== SIDE COURSES"));
  // ⚠️ LA RÉPARATION REÇOIT LES MÊMES TEXTES, pas une seconde rédaction.
  assert(b.repairContext.sideCourses.includes("- mon: lunch — Alex starter + dessert"));
  assert(u.includes(b.repairContext.sideCourses));
  assert(u.includes(b.repairContext.standardRecipe));
  assert(b.repairContext.standardRecipe.startsWith("== WRITE ONE STANDARD RECIPE PER DISH =="));
  assert(u.includes(b.repairContext.cards));
  // ⛔ ET TOUJOURS AUCUN kcal nu: les calories d'un à-côté restent au moteur.
  assertEquals(u.match(/\d+\s*kcal(?!\s*per\s*100\s*g)/gi), null);
});

Deno.test("⑤ v33 — SANS à-côté, aucun bloc, aucun renvoi, et le compteur le dit", () => {
  const sans = blocks({ sizingPath: "portion_v1" });
  const vide = blocks({ sizingPath: "portion_v1", sideCourses: [] });
  assertEquals(sans.userSuffix, vide.userSuffix, "`[]` et champ absent se lisent pareil");
  assert(!sans.userSuffix.includes("SIDE COURSES"), sans.userSuffix);
  assert(sans.userSuffix.includes("Never add a dessert, bread or a starter to a dish: the dish is what you write"));
  assertEquals(sans.sideCourses, { given: 0, prompt_asked: 0, cells: 0, unplaced: 0 });
  assertEquals(sans.repairContext.sideCourses, "");
});

Deno.test("⑤ v33 — une demande pour quelqu'un hors du prompt n'est PAS écrite, et elle est comptée", () => {
  const b = blocks({
    sizingPath: "portion_v1",
    sideCourses: [ask({ dayToken: "mon", slot: "lunch" }), ask({ memberId: "m-inconnu", dayToken: "mon", slot: "dinner" })],
  });
  assert(!b.userSuffix.includes("m-inconnu"), "un id que rien ne présente est écrit");
  assertEquals(b.sideCourses, { given: 4, prompt_asked: 2, cells: 1, unplaced: 2 });
});

Deno.test("⑤ `legacy_measure` — le bloc sort aussi, mais sans recette, donc sans renvoi", () => {
  const b = blocks({ sideCourses: [ask({ dayToken: "mon", slot: "lunch" })] });
  assert(b.userSuffix.includes("== SIDE COURSES"), "les à-côtés ne dépendent pas du chemin de mesure");
  assert(!b.userSuffix.includes("(SIDE COURSES)"), "aucune recette, donc aucun renvoi");
  assertEquals(b.repairContext.standardRecipe, "");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ ⟳ 2026-09-23 — v38: UNE SEULE RÈGLE DU FÉCULENT, SEUL OU À PLUSIEURS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT, MESURÉ SUR LE BROUILLON `1461270e` (une personne seule, en
// perte de poids): aucun plat n'avait son féculent à part, céréale sèche
// médiane 69 g, part d'énergie du féculent 0,35 contre 0,30 visé. La consigne
// disait « A lunch or dinner eaten by ONE person is a complete plate in ONE
// dish »; seul un repas PARTAGÉ recevait l'ordre `separable_side`.

/** Ce qui manque ou ce qui reste de l'ancienne règle à deux branches. */
function regleDuFeculent(texte: string): string[] {
  const plat = texte.replace(/\n/g, " ");
  const ecarts: string[] = [];
  if (!plat.includes("Every lunch and dinner, eaten alone or shared, is ONE main preparation")) {
    ecarts.push("la règle unique manque");
  }
  for (
    const branche of [
      "is a complete plate in ONE dish",
      "eaten by ONE person",
      "SHARED by two people or more",
      "the starch pot of a shared dish",
    ]
  ) {
    if (plat.includes(branche)) ecarts.push(branche);
  }
  return ecarts;
}

Deno.test("⑥ v38 — PASSE: la recette servie porte UNE règle, sans branche", () => {
  for (const served of [true, false]) {
    const bloc = standardRecipeBlock({ normal: 100, light: 60 }, { served }).join("\n");
    assertEquals(regleDuFeculent(bloc), [], `served=${served}`);
    // La même phrase porte la préparation principale, THE TEMPLATE et la clé.
    assert(
      bloc.includes(
        "Every lunch and dinner, eaten alone or shared, is ONE main preparation (the\n" +
          "protein, the vegetables, the sauce, in the amounts of THE TEMPLATE's main pot)\n" +
          "AND its starch as a SEPARATE preparation, cooked in its own pot: rice, pasta,\n" +
          "semolina, bulgur, quinoa or potatoes. The\n" +
          'starch preparation has one component, role "separable_side", and the dish\n' +
          '"uses" BOTH preparations;',
      ),
      bloc,
    );
    // La casserole-féculent de TOUT plat est exemptée des 150 g de légumes.
    assert(bloc.includes("serving (the starch pot excepted: its vegetables are in\nthe main pot);"), bloc);
  }
});

Deno.test("⑥ v38 — MORD: l'ancienne règle à deux branches est refusée", () => {
  // ÉCRITE EN DUR, telle qu'elle était servie jusqu'à v37.
  const ancienne = [
    "A lunch or dinner eaten by ONE person is a complete plate in ONE dish: a",
    "starch, a protein, a fat, in the amounts of THE TEMPLATE.",
    "A lunch or dinner SHARED by two people or more is ONE main preparation (the",
    "protein, the vegetables, the sauce) AND its starch as a SEPARATE preparation,",
  ].join("\n");
  assertEquals(regleDuFeculent(ancienne), [
    "la règle unique manque",
    "is a complete plate in ONE dish",
    "eaten by ONE person",
    "SHARED by two people or more",
  ]);
  // Et la vieille phrase remise à côté de la nouvelle mord aussi.
  const bloc = STANDARD_RECIPE_BLOCK.join("\n");
  assertEquals(regleDuFeculent(`${ancienne.split("\n").slice(0, 2).join("\n")}\n${bloc}`), [
    "is a complete plate in ONE dish",
    "eaten by ONE person",
  ]);
});

Deno.test("⑥ v38 — v33 (personne seule, `portion_v1`) reçoit la règle unique", () => {
  const { userSuffix, repairContext } = blocks({ sizingPath: "portion_v1" });
  assertEquals(regleDuFeculent(userSuffix), [], userSuffix);
  assertEquals(userSuffix.split("Every lunch and dinner, eaten alone or shared").length - 1, 1);
  // La réparation reçoit le même texte.
  assertEquals(regleDuFeculent(repairContext.standardRecipe), []);
  // ⚠️ Sous `legacy_measure` la recette n'est pas servie: la règle non plus.
  const legacy = blocks({});
  assert(!legacy.userSuffix.includes("eaten alone or shared"), "la recette fuit vers legacy_measure");
});
