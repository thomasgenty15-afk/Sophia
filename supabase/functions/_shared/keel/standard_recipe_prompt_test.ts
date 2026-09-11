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
} from "./household_meal_generation.ts";
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
  assertEquals(empreintes, {
    deux: "a298e286a1b22f1d318f7ef066f8a0ff7d6a849a3e79a64e2f554a28203f0f87",
    deux_objectif: "a7c77b2bf4a8308516846203b19070817fd3643a1cdbd116a7bf497091f5281e",
    quatre: "a13bf0c630413de47aa955baa942dd2cc5076cd3551805c5e1737b4dbe8a2c70",
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
  assertEquals(HOUSEHOLD_PROMPT_VERSION, "v33_one_standard_recipe_the_engine_multiplies");
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
