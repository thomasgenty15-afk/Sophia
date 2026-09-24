/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES À-CÔTÉS DANS LA CONSIGNE — ce que le modèle lit, et la clé qu'il rend.
 * ⟳ 2026-09-23 — flux C du chantier « assiettes normales ».
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   deno test --allow-read --allow-env \
 *     supabase/functions/_shared/keel/side_courses_prompt_test.ts
 *
 * ⛔ CE QUE CES CAS PROUVENT, ET CE QU'ILS NE PROUVENT PAS. Aucun appel
 * modèle: ils tiennent que la consigne NOMME ce que le moteur a décidé, que la
 * clé de schéma touche sa promesse, que l'échappatoire est dite, et qu'aucun
 * kcal ne fuit. Le taux de réponse du modèle se mesure à la campagne (vague 4,
 * compteurs `declared / asked`).
 *
 * Les nombres sont écrits EN DUR, jamais recalculés depuis le module.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  emptySideCoursesCounts,
  SIDE_COURSES_HEADER,
  SIDE_COURSES_TOKEN_FIELDS,
  SIDE_COURSES_TRANSLATABLE_FIELDS,
  sideCoursesBlock,
  sideCoursesCell,
  sideCoursesCellText,
  sideCoursesGiven,
  sideCoursesLanguageFields,
} from "./side_courses_prompt.ts";
import { buildContentLanguageBlock } from "./locale.ts";
import { MEAL_TOKEN_FIELDS, MEAL_TRANSLATABLE_FIELDS } from "./meal_generation.ts";
import type { SideCourseAsk, SideCourseKind } from "./side_courses_types.ts";

// ---------------------------------------------------------------------------
// Fabriques — le foyer de l'audit du 2026-09-23
// ---------------------------------------------------------------------------

const NAMES = new Map([
  ["m-thomas", "Thomas"],
  ["m-christele", "Christèle"],
  ["m-fabrice", "Fabrice"],
]);

function ask(
  memberId: string,
  dayToken: string,
  slot: "lunch" | "dinner",
  kinds: readonly SideCourseKind[],
  goal: SideCourseAsk["goal"],
  dayIndex = 0,
): SideCourseAsk {
  return {
    memberId,
    dayToken,
    slot,
    dayIndex,
    goal,
    courses: kinds.map((kind) => ({ kind, kcal: 100, proteinEstG: 2 })),
  };
}

const THOMAS_MON_LUNCH = ask("m-thomas", "mon", "lunch", ["cheese", "dessert"], "muscle_gain");
const CHRISTELE_MON_LUNCH = ask("m-christele", "mon", "lunch", ["dessert"], "maintenance");
const FABRICE_MON_LUNCH = ask("m-fabrice", "mon", "lunch", ["starter", "dessert"], "fat_loss");

// ---------------------------------------------------------------------------
// ① LA LIGNE D'UNE CASE (v34)
// ---------------------------------------------------------------------------

Deno.test("① la fin de ligne d'une case nomme chacun et ses types, dans l'ordre reçu", () => {
  assertEquals(
    sideCoursesCellText([THOMAS_MON_LUNCH, CHRISTELE_MON_LUNCH], NAMES),
    " Side courses: Thomas cheese + dessert; Christèle dessert.",
  );
  const trois = sideCoursesCell([THOMAS_MON_LUNCH, CHRISTELE_MON_LUNCH, FABRICE_MON_LUNCH], NAMES);
  assertEquals(
    trois.text,
    " Side courses: Thomas cheese + dessert; Christèle dessert; Fabrice starter + dessert.",
  );
  assertEquals(trois.named, 5);
});

Deno.test("① deux demandes de la même personne sont FUSIONNÉES; un type n'est nommé qu'une fois", () => {
  const a = ask("m-thomas", "mon", "lunch", ["cheese"], "muscle_gain");
  const b = ask("m-thomas", "mon", "lunch", ["cheese", "bread"], "muscle_gain");
  const cell = sideCoursesCell([a, b], NAMES);
  assertEquals(cell.text, " Side courses: Thomas cheese + bread.");
  assertEquals(cell.named, 2);
});

Deno.test("① ⛔ une personne sans prénom, un type hors vocabulaire: RIEN n'est écrit pour eux", () => {
  // Écrire un id à la place d'un prénom ferait nommer au modèle quelqu'un que
  // rien d'autre dans le message ne présente.
  const inconnu = ask("m-inconnu", "mon", "lunch", ["dessert"], "maintenance");
  const soupe = {
    ...ask("m-fabrice", "mon", "lunch", [], "fat_loss"),
    // deno-lint-ignore no-explicit-any
    courses: [{ kind: "soup" as any, kcal: 60, proteinEstG: 1 }],
  };
  assertEquals(sideCoursesCell([inconnu, soupe], NAMES), { text: "", named: 0 });
  assertEquals(sideCoursesCellText([], NAMES), "");
  // Le cas qui PASSE à côté: la même liste plus une demande lisible.
  assertEquals(
    sideCoursesCellText([inconnu, soupe, CHRISTELE_MON_LUNCH], NAMES),
    " Side courses: Christèle dessert.",
  );
});

Deno.test("① `sideCoursesGiven` compte un à-côté par type et par demande, hors vocabulaire exclu", () => {
  assertEquals(sideCoursesGiven([THOMAS_MON_LUNCH, CHRISTELE_MON_LUNCH, FABRICE_MON_LUNCH]), 5);
  assertEquals(sideCoursesGiven([]), 0);
  assertEquals(sideCoursesGiven(null), 0);
  assertEquals(sideCoursesGiven(undefined), 0);
  const doublon = ask("m-thomas", "mon", "lunch", ["cheese", "cheese"], "muscle_gain");
  assertEquals(sideCoursesGiven([doublon]), 1);
  assertEquals(emptySideCoursesCounts(), { given: 0, prompt_asked: 0, cells: 0, unplaced: 0 });
});

// ---------------------------------------------------------------------------
// ② LE BLOC — la promesse, la clé, l'échappatoire
// ---------------------------------------------------------------------------

const V34 = () =>
  sideCoursesBlock({
    asks: [THOMAS_MON_LUNCH, CHRISTELE_MON_LUNCH, FABRICE_MON_LUNCH],
    nameOf: NAMES,
    perDay: false,
  });

Deno.test("② ⛔ LA CLÉ DE SCHÉMA EST À SIX LIGNES AU PLUS SOUS SA PROMESSE", () => {
  // Cicatrice `promise-and-schema-key-must-be-adjacent`: 0 % de conformité
  // quand la promesse et la clé vivaient dans deux messages.
  for (const perDay of [false, true]) {
    const lines = sideCoursesBlock({
      asks: [THOMAS_MON_LUNCH, FABRICE_MON_LUNCH],
      nameOf: NAMES,
      perDay,
    }).block.split("\n");
    const promise = lines.findIndex((l) =>
      l.includes("The dish is not the whole meal: the app serves a side course beside it.")
    );
    const key = lines.findIndex((l) => l.includes('"side_courses": ['));
    assert(promise >= 0 && key > promise, lines.join("\n"));
    assert(key - promise <= 6, `clé à ${key - promise} lignes de la promesse (perDay=${perDay})`);
    assertEquals(lines[0], SIDE_COURSES_HEADER);
    assertEquals(SIDE_COURSES_HEADER, "== SIDE COURSES (household): ONE FOOD BESIDE THE DISH ==");
  }
});

Deno.test("② ⛔ L'ÉCHAPPATOIRE EST NOMMÉE, sur une ligne, collée à la clé", () => {
  const { block } = V34();
  const lines = block.split("\n");
  const escape = lines.findIndex((l) =>
    l.includes("a food named once, never grams, never a second dish.")
  );
  const keyEnd = lines.findIndex((l) => l.includes('"preparation_id": "<id of its preparation, or null>" } ]'));
  assert(escape > keyEnd && keyEnd >= 0 && escape - keyEnd <= 2, block);
  // Les six champs du schéma, tous nommés. ⟳ 2026-09-24 — `"ref"` en est
  // sorti : le modèle nomme l'aliment, la lane l'identifie par son nom.
  for (const field of ['"day"', '"slot"', '"member_id"', '"kind"', '"term"', '"preparation_id"']) {
    assert(block.includes(field), `${field} manque au schéma`);
  }
  assert(!block.includes('"ref"'), "le schéma des à-côtés ne demande plus d'identifiant");
  assert(block.includes('"starter"|"cheese"|"dessert"|"bread"'));
});

Deno.test("② v34 — le bloc RENVOIE au calendrier et ne répète pas la répartition", () => {
  const out = V34();
  assert(out.block.includes('At each lunch and dinner the calendar marks "Side courses:"'), out.block);
  assert(!out.block.includes("- mon:"), "la répartition vit sur les lignes du calendrier");
  // C'est le calendrier qui compte, pas le bloc.
  assertEquals([out.named, out.cells], [0, 0]);
});

Deno.test("② les identifiants sont listés UNE fois, pour qui a un à-côté", () => {
  const { block } = V34();
  assert(
    block.includes("Exact member ids: Thomas = m-thomas; Christèle = m-christele; Fabrice = m-fabrice."),
    block,
  );
  for (const id of ["m-thomas", "m-christele", "m-fabrice"]) {
    assertEquals(block.split(id).length - 1, 1, `${id} listé plusieurs fois`);
  }
  const seul = sideCoursesBlock({ asks: [CHRISTELE_MON_LUNCH], nameOf: NAMES, perDay: false }).block;
  assert(!seul.includes("m-thomas"), "un id sans à-côté est listé");
});

Deno.test("② CE QU'EST CHAQUE TYPE: la soupe est une PRÉPARATION, rien ne va dans le plat", () => {
  const { block } = V34();
  assert(block.includes("A soup or a grated salad made ahead is a PREPARATION:"), block);
  assert(block.includes('write it in "preparations", cook it in a cooking session at most 3 days'));
  assert(block.includes('give its id in "preparation_id"'));
  assert(block.includes("Write no amount: the app weighs every side course for each person."));
  assert(block.includes("Never put\nthese foods inside the dish."), block);
  assert(block.includes("A dairy dessert counts in the 250 g of fresh\ndairy per person per day."), block);
  // ⛔ LA GARDE DE FUITE: aucun kcal. Les calories d'un à-côté restent au moteur.
  assertEquals(block.match(/kcal/gi), null);
  assertEquals(block.match(/\bkg\b/gi), null);
});

Deno.test("② ⛔ LE DESSERT D'UNE CARTE « PERTE » EST UN FRUIT OU UN LAITAGE NATURE, et elle est NOMMÉE", () => {
  const { block } = V34();
  // ⟳ 2026-09-23 — un seul aliment, jamais un mélange. La ligne « Nuts are
  // fine too » du maintien est retirée.
  // ⟳ 2026-09-23 (v40) — le dessert DENSE de la prise est retiré: Thomas
  // partage ce repas, il est nommé pour suivre la table.
  assert(
    block.includes(
      "  · dessert: one fruit or one plain dairy (plain yogurt, fromage blanc, skyr),\n    never a mix.\n" +
        "    For Thomas too: the same dessert as the rest of the table, nothing denser.\n" +
        "    For Fabrice: ONLY a fruit or a plain dairy, nothing sweeter.",
    ),
    block,
  );
  assert(!block.includes("fine too"), block);
  // ── LE CAS QUI MORD: la personne en perte, et le maintien, ne sont jamais
  // dans la ligne de la prise.
  const gain = block.split("\n").find((x) => x.includes("nothing denser")) ?? "";
  assert(!gain.includes("Fabrice") && !gain.includes("Christèle"), gain);
  // Un mineur reste au fruit ou au laitage, sans ligne qui ouvre.
  const enfant = sideCoursesBlock({
    asks: [ask("m-christele", "mon", "dinner", ["dessert"], "minor")],
    nameOf: NAMES,
    perDay: false,
  }).block;
  assert(!enfant.includes("nothing denser"), enfant);
  assert(!enfant.includes("ONLY a fruit"), enfant);
  // Sans dessert demandé, aucune ligne de dessert.
  const sansDessert = sideCoursesBlock({
    asks: [ask("m-thomas", "mon", "dinner", ["cheese"], "muscle_gain")],
    nameOf: NAMES,
    perDay: false,
  }).block;
  assert(!sansDessert.includes("· dessert"), sansDessert);
});

Deno.test("② ⛔ PERSONNE À NOMMER ⇒ `\"\"` — la contre-épreuve de chaque appelant", () => {
  const empty = { block: "", named: 0, cells: 0 };
  assertEquals(sideCoursesBlock({ asks: [], nameOf: NAMES, perDay: false }), empty);
  assertEquals(sideCoursesBlock({ asks: [], nameOf: NAMES, perDay: true }), empty);
  assertEquals(
    sideCoursesBlock({
      asks: [ask("m-inconnu", "mon", "lunch", ["dessert"], "maintenance")],
      nameOf: NAMES,
      perDay: true,
    }),
    empty,
  );
  // Un moment hors de SIDE_COURSE_SLOTS n'est pas écrit.
  const matin = { ...CHRISTELE_MON_LUNCH, slot: "breakfast" as unknown as "lunch" };
  assertEquals(sideCoursesBlock({ asks: [matin], nameOf: NAMES, perDay: true }), empty);
});

// ---------------------------------------------------------------------------
// ③ v33 — UNE LIGNE PAR JOUR
// ---------------------------------------------------------------------------

Deno.test("③ v33 — une ligne par jour, dans l'ordre de la fenêtre, déjeuner avant dîner", () => {
  const asks = [
    ask("m-fabrice", "tue", "dinner", ["dessert"], "fat_loss", 1),
    ask("m-fabrice", "mon", "dinner", ["starter"], "fat_loss", 0),
    ask("m-fabrice", "tue", "lunch", ["starter", "dessert"], "fat_loss", 1),
    ask("m-fabrice", "mon", "lunch", ["starter", "dessert"], "fat_loss", 0),
  ];
  const out = sideCoursesBlock({ asks, nameOf: NAMES, perDay: true });
  const lines = out.block.split("\n");
  const mon = lines.indexOf("- mon: lunch — Fabrice starter + dessert; dinner — Fabrice starter.");
  const tue = lines.indexOf("- tue: lunch — Fabrice starter + dessert; dinner — Fabrice dessert.");
  assert(mon >= 0 && tue === mon + 1, out.block);
  assert(out.block.includes("At each lunch and dinner listed below, every person named gets the side"));
  assertEquals([out.named, out.cells], [6, 4]);
  // ⚠️ DÉTERMINISTE: l'ordre d'arrivée ne change rien.
  assertEquals(
    sideCoursesBlock({ asks: [...asks].reverse(), nameOf: NAMES, perDay: true }).block,
    out.block,
  );
});

Deno.test("③ v33 — deux personnes le même moment: séparées par une virgule, pas un point-virgule", () => {
  const out = sideCoursesBlock({
    asks: [THOMAS_MON_LUNCH, FABRICE_MON_LUNCH],
    nameOf: NAMES,
    perDay: true,
  });
  assert(
    out.block.includes("- mon: lunch — Thomas cheese + dessert, Fabrice starter + dessert."),
    out.block,
  );
  assertEquals([out.named, out.cells], [4, 1]);
});

// ---------------------------------------------------------------------------
// ④ ⟳ 2026-09-23 (vague 2, contrôle) — LA LANGUE DE LA CLÉ `side_courses`
// ---------------------------------------------------------------------------

Deno.test("④ épinglage — les champs de langue de la clé `side_courses`", () => {
  assertEquals([...SIDE_COURSES_TRANSLATABLE_FIELDS], ["side_courses[].term"]);
  assertEquals([...SIDE_COURSES_TOKEN_FIELDS], [
    "side_courses[].kind (one of: starter, cheese, dessert, bread)",
    "side_courses[].member_id (the exact id, never a name)",
    "side_courses[].preparation_id (must match preparations[].id exactly)",
  ]);
});

Deno.test("④ le bloc de langue d'une consigne QUI porte les à-côtés nomme `term` à traduire et `kind` à garder", () => {
  const f = sideCoursesLanguageFields({ given: 3, prompt_asked: 3, cells: 2, unplaced: 0 });
  const bloc = buildContentLanguageBlock(
    "fr-FR",
    [...MEAL_TRANSLATABLE_FIELDS, "explanation[]", ...f.translatable],
    [...MEAL_TOKEN_FIELDS, ...f.tokens],
  );
  const traduits = bloc.split("\n").find((l) => l.startsWith("This applies to these fields")) ?? "";
  assert(traduits.includes("side_courses[].term"), traduits);
  // ⛔ ET `kind` N'EST PAS DANS LES CHAMPS À TRADUIRE, il est dans les jetons.
  assert(!traduits.includes("side_courses[].kind"), traduits);
  assert(bloc.includes("side_courses[].kind (one of: starter, cheese, dessert, bread)"), bloc);
});

Deno.test("④ ⛔ une consigne SANS à-côté ne nomme aucun champ `side_courses` — le bloc est celui d'avant", () => {
  const f = sideCoursesLanguageFields(emptySideCoursesCounts());
  assertEquals(f.translatable.length, 0);
  assertEquals(f.tokens.length, 0);
  // Reçus mais écrits nulle part (`unplaced`): la clé n'est pas dans la consigne.
  const nonPlaces = sideCoursesLanguageFields({ given: 2, prompt_asked: 0, cells: 0, unplaced: 2 });
  assertEquals(nonPlaces.translatable.length + nonPlaces.tokens.length, 0);
  const avant = buildContentLanguageBlock("fr-FR", [...MEAL_TRANSLATABLE_FIELDS, "explanation[]"], MEAL_TOKEN_FIELDS);
  const apres = buildContentLanguageBlock(
    "fr-FR",
    [...MEAL_TRANSLATABLE_FIELDS, "explanation[]", ...f.translatable],
    [...MEAL_TOKEN_FIELDS, ...f.tokens],
  );
  assertEquals(apres, avant);
  assert(!apres.includes("side_courses"));
});

Deno.test("④ ⛔ la fin de ligne d'une case ne porte JAMAIS la clé de schéma (ce que la réparation reçoit)", () => {
  const text = sideCoursesCellText([THOMAS_MON_LUNCH, FABRICE_MON_LUNCH], NAMES);
  assertEquals(text, " Side courses: Thomas cheese + dessert; Fabrice starter + dessert.");
  assert(!text.includes("side_courses"));
  assert(!text.includes('"'));
});

// ---------------------------------------------------------------------------
// ⑤ ⟳ 2026-09-23 — LES À-CÔTÉS EN FAMILLES: la table, l'exception, deux jours
// ---------------------------------------------------------------------------
//
// Mesuré sur la campagne du 2026-09-23: « emmental + 2 pommes » à 10 repas sur
// 10 pour Thomas. Les trois phrases sont écrites EN DUR ici: les changer doit
// faire rougir ce fichier.

const TABLE_RULE =
  "Think of the TABLE, not of each plate: at one meal, ONE cheese, ONE dessert, ONE bread, ONE starter for everyone who has one; each person gets their own amount.";
// ⟳ 2026-09-23 (v40) — « bread may stay the same all week ».
const TWO_DAYS_RULE =
  "Serve a food 2 days in a row at most, then change it; bread may stay the same all week; over the plan, 2 to 3 cheeses, 3 to 4 fruits, 1 to 2 breads, so the shopping list stays short.";
const EXCEPTION_RULE =
  "Only someone who cannot eat the table's food (allergy, exclusion, diet) gets another food of the same kind.";

/** Trois jours, trois personnes, au déjeuner: le foyer de la campagne. */
function threeDays(): SideCourseAsk[] {
  const out: SideCourseAsk[] = [];
  for (const [day, i] of [["mon", 0], ["tue", 1], ["wed", 2]] as const) {
    out.push(ask("m-thomas", day, "lunch", ["cheese", "dessert"], "muscle_gain", i));
    out.push(ask("m-christele", day, "lunch", ["dessert"], "maintenance", i));
    out.push(ask("m-fabrice", day, "lunch", ["starter", "dessert"], "fat_loss", i));
  }
  return out;
}

/**
 * CE QUI MANQUE aux règles des familles dans un bloc: chaque phrase présente
 * ET à six lignes au plus de la clé; aucun kcal. `[]` = tout y est.
 */
function familyVerdict(block: string): string[] {
  const lines = block.split("\n");
  const key = lines.findIndex((l) => l.includes('"side_courses": ['));
  const near = (phrase: string) => {
    const at = lines.findIndex((l) => l.includes(phrase));
    return key >= 0 && at >= 0 && Math.abs(at - key) <= 6;
  };
  const missing: string[] = [];
  if (!near(TABLE_RULE)) missing.push("table");
  if (!near(TWO_DAYS_RULE)) missing.push("two_days");
  if (!near(EXCEPTION_RULE)) missing.push("exception");
  if (/kcal/i.test(block)) missing.push("kcal");
  return missing;
}

Deno.test("⑤ ⛔ LA TABLE, L'EXCEPTION ET LES DEUX JOURS: présentes, à six lignes au plus de la clé, sans kcal", () => {
  for (const perDay of [false, true]) {
    const { block } = sideCoursesBlock({ asks: threeDays(), nameOf: NAMES, perDay });
    assertEquals(familyVerdict(block), [], `perDay=${perDay}\n${block}`);
    // Les distances, en dur: la table à 3 lignes au-dessus de la clé, les
    // deux jours à 2, l'exception à 6 en dessous (sous l'échappatoire).
    const lines = block.split("\n");
    const key = lines.findIndex((l) => l.includes('"side_courses": ['));
    assertEquals(key - lines.indexOf(TABLE_RULE), 3);
    assertEquals(key - lines.indexOf(TWO_DAYS_RULE), 2);
    assertEquals(lines.indexOf(EXCEPTION_RULE) - key, 6);
    // Et la promesse reste à six lignes au plus de sa clé.
    const promise = lines.findIndex((l) =>
      l.includes("The dish is not the whole meal: the app serves a side course beside it.")
    );
    assertEquals(key - promise, 6);
    assertEquals(lines[key - 1], "Return the foods in ONE more top-level key of the JSON:");
  }
});

Deno.test("⑤ ⛔ MUTATION — une phrase retirée, ou éloignée de la clé, fait rougir le verdict, elle seule", () => {
  const { block } = sideCoursesBlock({ asks: threeDays(), nameOf: NAMES, perDay: false });
  assertEquals(familyVerdict(block), []);
  const without = (phrase: string) =>
    block.split("\n").filter((l) => l !== phrase).join("\n");
  assertEquals(familyVerdict(without(TABLE_RULE)), ["table"]);
  assertEquals(familyVerdict(without(TWO_DAYS_RULE)), ["two_days"]);
  assertEquals(familyVerdict(without(EXCEPTION_RULE)), ["exception"]);
  // Éloignée: la phrase de la table déplacée en fin de bloc.
  assertEquals(familyVerdict(`${without(TABLE_RULE)}\n${TABLE_RULE}`), ["table"]);
  assertEquals(familyVerdict(`${block}\nabout 90 kcal`), ["kcal"]);
});

Deno.test("⑤ GARDÉES PAR LEUR FAIT — seul, pas de table; deux jours ou moins, pas de règle des deux jours", () => {
  // Une personne seule sur trois jours: la règle des deux jours, sans la table.
  const solo = sideCoursesBlock({
    asks: threeDays().filter((a) => a.memberId === "m-fabrice"),
    nameOf: NAMES,
    perDay: true,
  }).block;
  assert(solo.includes(TWO_DAYS_RULE), solo);
  assert(!solo.includes("TABLE"), solo);
  assert(!solo.includes(EXCEPTION_RULE), solo);
  // Trois personnes sur un seul jour: la table, sans la règle des deux jours.
  const unJour = V34().block;
  assert(unJour.includes(TABLE_RULE), unJour);
  assert(unJour.includes(EXCEPTION_RULE), unJour);
  assert(!unJour.includes("2 days in a row"), unJour);
  // Deux personnes le même jour mais à deux moments différents: aucune table.
  const decales = sideCoursesBlock({
    asks: [
      ask("m-thomas", "mon", "lunch", ["dessert"], "muscle_gain"),
      ask("m-christele", "mon", "dinner", ["dessert"], "maintenance"),
    ],
    nameOf: NAMES,
    perDay: false,
  }).block;
  assert(!decales.includes("TABLE"), decales);
  // Deux personnes au même repas, mais sans type commun: aucune table non plus.
  const sansCommun = sideCoursesBlock({
    asks: [
      ask("m-thomas", "mon", "lunch", ["cheese"], "muscle_gain"),
      ask("m-christele", "mon", "lunch", ["dessert"], "maintenance"),
    ],
    nameOf: NAMES,
    perDay: false,
  }).block;
  assert(!sansCommun.includes("TABLE"), sansCommun);
  // Sans aucune des deux règles, la clé reste à quatre lignes de sa promesse.
  const lines = decales.split("\n");
  assertEquals(
    lines.findIndex((l) => l.includes('"side_courses": [')) -
      lines.findIndex((l) => l.includes("The dish is not the whole meal")),
    4,
  );
});

Deno.test("⟳ v40 — ⛔ AUCUN DESSERT DENSE, MÊME EN PRISE; la prise n'est nommée que si elle partage un repas à dessert", () => {
  // Thomas en prise, à la table de Christèle et Fabrice: nommé, jamais « dense ».
  const avecPrise = sideCoursesBlock({ asks: threeDays(), nameOf: NAMES, perDay: false }).block;
  assert(
    avecPrise.includes("    For Thomas too: the same dessert as the rest of the table, nothing denser."),
    avecPrise,
  );
  for (const gone of ["DENSE", "dried figs", "dates", "nuts", "compote", "Never several fruits"]) {
    assert(!avecPrise.includes(gone), `${gone}\n${avecPrise}`);
  }
  assertEquals(avecPrise.match(/kcal/gi), null);
  // ── LE CAS QUI MORD: Thomas seul à son repas à dessert — aucune table à suivre.
  const seul = sideCoursesBlock({
    asks: [
      ask("m-thomas", "mon", "lunch", ["dessert"], "muscle_gain"),
      ask("m-christele", "mon", "dinner", ["dessert"], "maintenance"),
    ],
    nameOf: NAMES,
    perDay: false,
  }).block;
  assert(!seul.includes("nothing denser"), seul);
  // Sans personne en prise: aucune ligne de la prise.
  const sansPrise = sideCoursesBlock({
    asks: threeDays().filter((a) => a.goal !== "muscle_gain"),
    nameOf: NAMES,
    perDay: false,
  }).block;
  assert(!sansPrise.includes("nothing denser"), sansPrise);
});

// ---------------------------------------------------------------------------
// ⑥ ⟳ 2026-09-23 (v40) — LE NOM EXACT, JAMAIS LA CATÉGORIE
// ---------------------------------------------------------------------------

const NAME_RULE = 'Name the exact food ("apple", "emmental"), never a category ("fruit", "cheese").';

Deno.test("⟳ v40 — ⛔ LE NOM EXACT: une ligne, à sept lignes au plus sous la clé, avec ou sans table", () => {
  for (
    const [asks, distance] of [
      [threeDays(), 7],
      [[ask("m-fabrice", "mon", "lunch", ["dessert"], "fat_loss")], 6],
    ] as const
  ) {
    for (const perDay of [false, true]) {
      const lines = sideCoursesBlock({ asks: [...asks], nameOf: NAMES, perDay }).block.split("\n");
      const key = lines.findIndex((l) => l.includes('"side_courses": ['));
      assertEquals(lines.indexOf(NAME_RULE) - key, distance, lines.join("\n"));
    }
  }
  // Une consigne sans à-côté ne la porte pas.
  assertEquals(sideCoursesBlock({ asks: [], nameOf: NAMES, perDay: false }).block, "");
});
