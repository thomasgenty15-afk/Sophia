/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C — LES TROIS DÉFAUTS DU 2026-08-19, ET LA MUTATION QUI FAIT MORDRE
 *         CHAQUE GARDE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ① LA DOCTRINE ÉTAIT COMPILÉE SUR LA MAUVAISE PERSONNE. `loadPublishedDoctrine`
 *    lit `student_goals.goal` du TITULAIRE, et le foyer entier recevait cette
 *    variante-là. Mesuré: `goal_scope: ["muscle_gain"]` absent des 6 prompts sur
 *    6 d'un foyer dont l'athlète est à table et dont la maîtresse de maison est
 *    en `fat_loss`.
 *
 * ② LA PROSE SE TROMPAIT DE PERSONNE. Trois `dishes[].why` sur huit attribuaient
 *    l'évitement du gluten à quelqu'un qui n'a aucune contrainte, alors que le
 *    prompt attribue correctement (`- Lubna: gluten — allergy, severity=medical`).
 *
 * ③ LE BUDGET DE PLATS SE CONTREDISAIT DANS LE MÊME MESSAGE. « at most 8
 *    dishes » et, 130 lignes plus bas, « That is 6 extra dishes … the dish
 *    budget already has room for them » — alors que les repas de la table en
 *    valent 4, et que 4 + 6 = 10.
 *
 * ⚠️ CHAQUE GARDE A ICI **UN CAS QUI PASSE** ET **UN CAS QUI MORD**. Une garde
 * qu'on n'a pas vue tomber n'est pas une garde; et une garde qui coupe tout
 * ressemble trait pour trait à une garde qui marche.
 */

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import { type CoachDoctrine, parseCoachDoctrine } from "./doctrine.ts";
import {
  doctrineBeliefsFor,
  doctrineBlockFor,
  type LoadedDoctrine,
  tableScopeSection,
} from "./doctrine_loader.ts";
import {
  buildHouseholdPromptBlocks,
  countWhyRuleAttributions,
  type HouseholdRuleHolder,
} from "./household_meal_generation.ts";
import { dishBudgetFor, type MergedEater } from "./meal_generation.ts";
import { parseMemberAway, resolveWindowPresence } from "./household_presence.ts";
import type { PortionMember } from "./household_portions.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — la doctrine réelle du foyer mesuré, aux mots près
// ---------------------------------------------------------------------------

/**
 * Les TROIS croyances du coach `Osric Thelwall`, telles que le run du
 * 2026-08-19 les portait en base. La troisième est celle qui n'atteignait
 * jamais le prompt.
 */
function doctrineOfTheRun(): CoachDoctrine {
  const { doctrine } = parseCoachDoctrine({
    coach_id: "c-osric",
    version: 3,
    coach_display_name: "Osric Thelwall",
    beliefs: [
      {
        key: "name_the_plate_out_loud",
        claim: "Every week starts with a plate you can name out loud, never with a number.",
        rationale: "a plate you can picture is a plate you will actually cook",
      },
      {
        key: "one_loud_vegetable",
        claim: "One loud vegetable on every plate, and it is the first thing in the basket.",
        rationale: "the basket decides the week, willpower does not",
      },
      {
        key: "starch_follows_the_session",
        claim: "On a muscle gain stretch the starch goes where the training is.",
        goal_scope: ["muscle_gain"],
      },
    ],
    content_locale: "en-GB",
  });
  return doctrine;
}

/** Une `LoadedDoctrine` de test, montée sur les mêmes champs que la vraie. */
function loadedOf(
  doctrine: CoachDoctrine,
  goal: "fat_loss" | "maintenance" | "muscle_gain" | null,
  tableGoals: readonly { goal: "fat_loss" | "maintenance" | "muscle_gain"; who: string }[],
): LoadedDoctrine {
  const section = tableScopeSection(doctrine, goal, tableGoals);
  // `compileDoctrineBlock` est appelé par le vrai chargeur; ici on reproduit sa
  // sortie par le même chemin, pour que le test porte sur la JONCTION et pas sur
  // une chaîne réécrite à la main.
  const compiled = compiledOf(doctrine, goal);
  return {
    doctrine,
    compiled,
    coachId: "c-osric",
    coachDisplayName: "Osric Thelwall",
    reason: "loaded",
    issues: [],
    goal,
    goalSource: goal === null ? "none" : "student_goals",
    tableScopeBlock: section.block,
    tableScopeBeliefs: section.beliefs,
  };
}

function compiledOf(
  doctrine: CoachDoctrine,
  goal: "fat_loss" | "maintenance" | "muscle_gain" | null,
) {
  // Importé paresseusement pour garder l'en-tête de ce fichier lisible: c'est la
  // même fonction que le chargeur appelle, jamais une copie.
  const { compileDoctrineBlock } = compileModule;
  return compileDoctrineBlock(doctrine, goal);
}
import * as compileModule from "./doctrine.ts";

// ===========================================================================
// ① LA PORTÉE SUIT LA BOUCHE
// ===========================================================================

Deno.test("① LE CAS QUI PASSE — sans table, le bloc est byte-identique à celui d'avant", () => {
  // ⛔ C'EST LA MOITIÉ QUI PROTÈGE ONZE APPELANTS SUR DOUZE. La conversation,
  // les crons, le bilan hebdo et la lane individuelle n'ont pas de table: leur
  // prompt ne doit pas gagner UN octet pour un lot qui ne les concerne pas.
  const d = doctrineOfTheRun();
  const sansTable = loadedOf(d, "fat_loss", []);
  assertEquals(sansTable.tableScopeBlock, "");
  assertEquals(doctrineBlockFor(sansTable), sansTable.compiled!.text);
  // Et la liste citable ne bouge pas non plus.
  assertEquals(
    doctrineBeliefsFor(sansTable).map((b) => b.key),
    ["name_the_plate_out_loud", "one_loud_vegetable"],
  );
});

Deno.test("① LE DÉFAUT MESURÉ — la croyance de l'athlète atteint enfin le prompt, NOMMÉE", () => {
  const d = doctrineOfTheRun();
  const avant = loadedOf(d, "fat_loss", []);
  const apres = loadedOf(d, "fat_loss", [{ goal: "muscle_gain", who: "Ivar" }]);

  // AVANT: la ligne du coach pour la prise de muscle n'existe nulle part.
  assert(
    !avant.compiled!.text.includes("the starch goes where the training is"),
    "la variante du titulaire portait déjà la croyance: le décor ne reproduit pas le défaut",
  );
  // APRÈS: elle est là, et elle porte un DESTINATAIRE.
  const bloc = doctrineBlockFor(apres);
  assert(bloc.includes("On a muscle gain stretch the starch goes where the training is."), bloc);
  assert(bloc.includes("- Ivar (muscle_gain):"), bloc);
  // ⚠️ ET ELLE NE REJOINT PAS « WHAT THIS COACH BELIEVES ». Fondue là-dedans,
  // elle s'appliquerait à la casserole commune d'une table dont le prompt
  // annonce `goal: fat_loss` quinze lignes plus haut.
  const believes = bloc.indexOf("-- WHAT THIS COACH BELIEVES --");
  const forSome = bloc.indexOf("-- WHAT THIS COACH WROTE FOR SOME OF THESE MOUTHS ONLY --");
  assert(believes >= 0 && forSome > believes, bloc);
  assert(
    bloc.slice(believes, forSome).indexOf("starch goes where the training is") < 0,
    "la ligne ciblée a fui dans le bloc commun",
  );
  // ⚠️ LE BLOC PORTE SON PROPRE INTERDIT DE SORTIE. Tout ce qui nomme une
  // personne ET une raison finit, mesuré 4 runs sur 4, dans un champ lu à table.
  assert(bloc.includes("Never write the goal, the reason"), bloc);
});

Deno.test("① LA CLÉ DEVIENT CITABLE, sinon le lot est branché puis désarmé", () => {
  // ⛔ SANS ÇA, LE MODÈLE REÇOIT LA LIGNE ET LE PARSEUR REFUSE QU'IL LA CITE:
  // le plan porte la conviction sans pouvoir la tracer, et le CHECK
  // `..._doctrine_traceable_check` la jette. On paierait le bloc sans l'avoir.
  const d = doctrineOfTheRun();
  const apres = loadedOf(d, "fat_loss", [{ goal: "muscle_gain", who: "Ivar" }]);
  assertEquals(
    doctrineBeliefsFor(apres).map((b) => b.key),
    ["name_the_plate_out_loud", "one_loud_vegetable", "starch_follows_the_session"],
  );
  // AUCUN DOUBLON: `tableScopeSection` écarte ce que la variante garde déjà.
  const keys = doctrineBeliefsFor(apres).map((b) => b.key);
  assertEquals(new Set(keys).size, keys.length);
});

Deno.test("① LA MUTATION — une bouche du MÊME objectif que le titulaire n'ajoute rien", () => {
  // ⛔ CE QUE LA GARDE `g === goal` ACHÈTE, ET IL FAUT L'ÉNONCER: le BLOC serait
  // vide de toute façon (le filtre des croyances écarte déjà tout ce que la
  // variante du titulaire garde). Ce que la garde tient, c'est le NOMBRE TRACÉ:
  // `table_goals` doit dire « combien d'objectifs AUTRES que celui du titulaire
  // cette table porte ». Sans elle, un foyer de quatre personnes toutes en
  // `fat_loss` journaliserait `table_goals: 3` — et la première question qu'on
  // pose à ce nombre, « ce foyer a-t-il des objectifs divergents ? », recevrait
  // la mauvaise réponse pour toujours.
  const d = doctrineOfTheRun();
  const section = tableScopeSection(d, "muscle_gain", [{ goal: "muscle_gain", who: "Ivar" }]);
  assertEquals(section.block, "");
  assertEquals(section.mouths.length, 0);
  // Et la variante du titulaire, elle, porte bien la ligne: le décor prouve que
  // le vide ci-dessus vient de la garde, pas d'une doctrine muette.
  const meme = loadedOf(d, "muscle_gain", [{ goal: "muscle_gain", who: "Ivar" }]);
  assert(meme.compiled!.text.includes("the starch goes where the training is"));
});

Deno.test("① LA MUTATION — un objectif que le coach n'a pas ciblé ne fabrique aucun bloc", () => {
  // Une table pleine d'objectifs différents ne suffit pas: il faut que le COACH
  // ait écrit quelque chose pour eux. Sans ça, `table_goals: 3` et
  // `table_scope_beliefs: 0` — deux nombres, deux réparations différentes.
  const d = doctrineOfTheRun();
  const rien = tableScopeSection(d, "fat_loss", [{ goal: "maintenance", who: "Lubna" }]);
  assertEquals(rien.block, "");
  assertEquals(rien.beliefs.length, 0);
  assertEquals(rien.mouths.length, 1);
});

Deno.test("① LA MUTATION — une bouche sans prénom, ou au jeton inconnu, tombe", () => {
  // ⛔ UNE LIGNE ANONYME EST EXACTEMENT CE QU'ON REMPLACE. « (muscle_gain): … »
  // sans nom serait une consigne sans destinataire, c'est-à-dire la consigne
  // d'avant ce lot avec un mot de plus.
  const d = doctrineOfTheRun();
  assertEquals(
    tableScopeSection(d, "fat_loss", [{ goal: "muscle_gain", who: "   " }]).block,
    "",
  );
  assertEquals(
    tableScopeSection(d, "fat_loss", [
      // deno-lint-ignore no-explicit-any
      { goal: "bulking" as any, who: "Ivar" },
    ]).block,
    "",
  );
});

Deno.test("① DEUX BOUCHES DU MÊME OBJECTIF SONT NOMMÉES ENSEMBLE, une seule ligne", () => {
  const d = doctrineOfTheRun();
  const deux = tableScopeSection(d, "fat_loss", [
    { goal: "muscle_gain", who: "Ivar" },
    { goal: "muscle_gain", who: "Tom" },
  ]);
  assert(deux.block.includes("- Ivar (muscle_gain), Tom (muscle_gain):"), deux.block);
  assertEquals(deux.beliefs.length, 1);
  // Le même prénom deux fois — un roster qui bégaie — ne dédouble pas la ligne.
  const bis = tableScopeSection(d, "fat_loss", [
    { goal: "muscle_gain", who: "Ivar" },
    { goal: "muscle_gain", who: "Ivar" },
  ]);
  assert(bis.block.includes("- Ivar (muscle_gain):"), bis.block);
});

Deno.test("① UNE DOCTRINE VIDE POUR LE TITULAIRE N'EST PLUS VIDE POUR LA TABLE", () => {
  // ⛔ LE CAS QUI SE SERAIT DÉSARMÉ TOUT SEUL. Un coach dont TOUT est écrit pour
  // `muscle_gain`, lu pour un titulaire en `fat_loss`, rendait `empty_for_goal`
  // — donc `NO_DOCTRINE_FOR_THIS_GOAL_BLOCK` À LA PLACE de ce qu'on vient de
  // reconstituer. Le lot aurait été branché puis annulé par la ligne d'à côté.
  const { doctrine } = parseCoachDoctrine({
    coach_id: "c-only-muscle",
    version: 1,
    coach_display_name: "Osric Thelwall",
    beliefs: [{
      key: "starch_follows_the_session",
      claim: "On a muscle gain stretch the starch goes where the training is.",
      goal_scope: ["muscle_gain"],
    }],
    content_locale: "en-GB",
  });
  const compiled = compiledOf(doctrine, "fat_loss");
  assertEquals(compiled.emptyForGoal, true, "le décor ne reproduit pas le cas");
  const section = tableScopeSection(doctrine, "fat_loss", [
    { goal: "muscle_gain", who: "Ivar" },
  ]);
  assertNotEquals(section.block, "");
});

// ===========================================================================
// ② LE `why` NE PORTE PLUS LA RÈGLE DE QUELQU'UN
// ===========================================================================

const ROXANE = "5ba01540-a6ba-4fc1-8ae3-6d7540f5aeec";
const LUBNA = "86129e3c-2f50-480f-a359-077165b6232b";

/** La seule bouche du foyer mesuré qui porte une règle: Lubna, végane cœliaque. */
const HOLDERS: readonly HouseholdRuleHolder[] = [
  { memberId: LUBNA, displayName: "Lubna" },
];

function answerWith(dishes: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ dishes, preparations: [], shopping_list: [] });
}

Deno.test("② LE CAS QUI PASSE — aucun `why` ne nomme de règle, et rien ne crie", () => {
  // ⛔ UNE GARDE A BESOIN D'UN CAS QUI PASSE. Une garde qui produit une `issue`
  // sur le comportement VOULU est une garde qu'on cesse de lire au troisième
  // run.
  const { counts, issues } = countWhyRuleAttributions(
    answerWith([
      { title: "Dahl", why: "Warm, cheap, and it reheats at work." },
      { title: "Chicken", why: "Quick on one hob, in season, uses the rice up." },
    ]),
    HOLDERS,
  );
  assertEquals(counts, { dishes: 2, declared: 0, valid: 0, refused: 0 });
  assertEquals(issues, []);
});

Deno.test("② LE DÉFAUT MESURÉ — la règle épinglée sur la mauvaise bouche est REFUSÉE", () => {
  // Plan réel `05-qualite-foyer/plan-4`, mot pour mot: trois `why` attribuent
  // l'évitement du gluten à Roxane. C'est Lubna qui l'a.
  const { counts, issues } = countWhyRuleAttributions(
    answerWith([
      {
        title: "Pan-Fried Thyme Chicken Strips",
        why: "A quick, warm lunch for Roxane that avoids gluten and fits her portioning needs.",
        why_rule_of: ROXANE,
      },
      { title: "Dahl", why: "Warm and it reheats." },
    ]),
    HOLDERS,
  );
  assertEquals(counts, { dishes: 2, declared: 1, valid: 0, refused: 1 });
  assert(issues.some((i) => i.includes("is not a mouth that holds a rule")), issues.join("|"));
  assert(issues.some((i) => i.includes("dishes[0]")), issues.join("|"));
});

Deno.test("② UNE RÈGLE NOMMÉE SUR LA BONNE BOUCHE RESTE UNE RÈGLE NOMMÉE", () => {
  // ⚠️ `valid` N'EST PAS « BIEN ». Le bloc demande qu'AUCUN `why` ne nomme de
  // règle: un id valide veut dire « une règle a bien été énoncée à table, et au
  // moins sur la bonne personne ». Le taire ferait de la consigne une phrase
  // sans lecteur — et quatre runs sur quatre l'ont désobéie.
  const { counts, issues } = countWhyRuleAttributions(
    answerWith([{ title: "Dahl", why: "Vegan, because Lubna eats vegan.", why_rule_of: LUBNA }]),
    HOLDERS,
  );
  assertEquals(counts, { dishes: 1, declared: 1, valid: 1, refused: 0 });
  assertEquals(issues, [`why_rule_named:${LUBNA}`]);
});

Deno.test("② `declared === valid + refused`, et ce n'est PAS une définition", () => {
  // ⛔ LA CICATRICE `withheld`/`over_cap`: deux nombres du même objet, l'un
  // dérivé de l'autre, se sont trouvés gonflé et dégonflé en sens inverses sans
  // que rien n'échoue. Ici les trois se comptent séparément, et l'égalité est
  // une PROPRIÉTÉ qu'un test vérifie.
  const { counts } = countWhyRuleAttributions(
    answerWith([
      { why: "a", why_rule_of: LUBNA },
      { why: "b", why_rule_of: ROXANE },
      { why: "c", why_rule_of: "  " },
      { why: "d" },
      { why: "e", why_rule_of: "not-an-id-at-all" },
    ]),
    HOLDERS,
  );
  assertEquals(counts.dishes, 5);
  assertEquals(counts.declared, counts.valid + counts.refused);
  assertEquals(counts, { dishes: 5, declared: 3, valid: 1, refused: 2 });
});

Deno.test("② UNE RÉPONSE ILLISIBLE REND ZÉRO, ET NE LÈVE PAS", () => {
  // Une réponse que ce module n'arrive pas à relire est une réponse que
  // `parseGeneratedMeal` a déjà refusée en amont. Lever ici ferait perdre un
  // dîner pour un compteur.
  const zero = { dishes: 0, declared: 0, valid: 0, refused: 0 };
  assertEquals(countWhyRuleAttributions("sorry, I cannot", HOLDERS).counts, zero);
  assertEquals(countWhyRuleAttributions('{"dishes": "nope"}', HOLDERS).counts, zero);
  assertEquals(countWhyRuleAttributions("", HOLDERS).counts, zero);
});

Deno.test("② LA MUTATION — sans porteur, le compteur ne peut RIEN valider", () => {
  // ⛔ ET C'EST POURQUOI `holders` EST TRACÉ À CÔTÉ DES TROIS NOMBRES.
  // `{holders: 0, declared: 0}` veut dire « on n'a rien demandé »;
  // `{holders: 2, declared: 0}` veut dire « on a demandé et rien n'est venu ».
  // Sans le premier nombre, les deux se lisent pareil.
  const { counts } = countWhyRuleAttributions(
    answerWith([{ why: "x", why_rule_of: LUBNA }]),
    [],
  );
  assertEquals(counts, { dishes: 1, declared: 1, valid: 0, refused: 1 });
});

// ---------------------------------------------------------------------------
// ② — LES DEUX MOITIÉS DU PROMPT
// ---------------------------------------------------------------------------

const MOUTH_A: PortionMember = {
  memberId: ROXANE,
  displayName: "Roxane",
  goal: "fat_loss",
  ageState: "adult",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
};
const MOUTH_B: PortionMember = {
  memberId: LUBNA,
  displayName: "Lubna",
  goal: null,
  ageState: "adult",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
};

const NOBODY_AWAY = resolveWindowPresence({
  members: [
    { memberId: ROXANE, displayName: "Roxane", away: parseMemberAway([]) },
    { memberId: LUBNA, displayName: "Lubna", away: parseMemberAway([]) },
  ],
  rhythm: [{ slot: "lunch", size: null }, { slot: "dinner", size: null }],
  windowDays: ["wed", "thu"],
});

function blocksWith(ruleHolders: readonly HouseholdRuleHolder[]) {
  return buildHouseholdPromptBlocks({
    members: [MOUTH_A, MOUTH_B],
    // ③ — aucune tradition: le prompt reste celui d'hier.
    traditions: [],
    daysInWindow: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    envyLine: null,
    restrictions: [],
    presence: NOBODY_AWAY,
    merge: null,
    unmerge: null,
    cooking: "one_dish",
    divergingCount: 0,
    weightGroups: 1,
    dishBearers: [],
    dedicatedDishesAsked: 0,
    medicalMouths: [], crossContactUnnamedMedical: 0,
    dietBlock: "",
    kitchenEquipment: null,
    voices: [],
    ruleHolders,
  });
}

Deno.test("② LE CAS QUI PASSE — personne ne porte de règle: prompt BYTE-IDENTIQUE à v18", () => {
  // ⛔ LA MOITIÉ QUI PROTÈGE LA POPULATION NON CONCERNÉE. Un foyer où personne
  // n'a déclaré d'allergie, de régime ni de règle de maison ne doit pas changer
  // de consigne pour un lot qui ne le concerne pas.
  const sans = blocksWith([]);
  const avec = blocksWith(HOLDERS);
  assertEquals(sans.whyRuleHolders, 0);
  assert(!sans.userSuffix.includes("WHAT A \"why\" IS ALLOWED TO SAY"), sans.userSuffix);
  assert(!sans.systemSuffix.includes("why_rule_of"), sans.systemSuffix);
  // Et le bloc n'est PAS vide quand il y a un porteur: le vide ci-dessus vient
  // de la garde, pas d'un bloc qui ne s'écrit jamais.
  assertNotEquals(sans.userSuffix, avec.userSuffix);
});

Deno.test("② LES DEUX MOITIÉS SONT SERVIES, ET LA LISTE FERMÉE EST DANS LE SCHÉMA", () => {
  // Le patron est celui de `for_member_id`, qui MARCHE en production: la clé et
  // sa liste fermée dans le schéma, l'ordre dans le message utilisateur.
  const avec = blocksWith(HOLDERS);
  assertEquals(avec.whyRuleHolders, 1);
  assert(avec.userSuffix.includes("WHAT A \"why\" IS ALLOWED TO SAY"), avec.userSuffix);
  assert(avec.userSuffix.includes("\"why_rule_of\""), avec.userSuffix);
  assert(avec.systemSuffix.includes('A dish can carry one more key: "why_rule_of".'), avec.systemSuffix);
  assert(avec.systemSuffix.includes(`Lubna = ${LUBNA}`), avec.systemSuffix);
  // ⚠️ LA BOUCHE SANS RÈGLE N'EST PAS DANS LA LISTE FERMÉE. C'est elle qui rend
  // le refus possible: si tout le monde y était, aucune attribution ne serait
  // jamais refusable — une garde qui ne mord jamais.
  assert(!avec.systemSuffix.includes(`Roxane = ${ROXANE}`), avec.systemSuffix);
});

// ===========================================================================
// ③ LE BUDGET DE PLATS COMPTE LES BOUCHES
// ===========================================================================

/** La fenêtre exacte du plan mesuré: mer + jeu, déjeuner et dîner. */
const TWO_SLOTS = [
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
] as const;

function budget(bearers: readonly string[], asked: number, shown = 0): number {
  const merge: MergedEater = {
    shape: "one_session",
    ownDishesShown: shown,
    dedicatedDishesAsked: asked,
    dedicatedCells: [],
    dishBearerIds: bearers,
  };
  return dishBudgetFor({
    scope: "several_days",
    // deno-lint-ignore no-explicit-any
    rhythm: TWO_SLOTS as any,
    daysToFill: 2,
    merge,
  });
}

Deno.test("③ LE DÉFAUT MESURÉ — 4 repas de table + 6 plats propres tiennent enfin", () => {
  // `prompt-user.txt` du 2026-08-19, deux lignes du MÊME message:
  //   l. 116  how much: several_days (at most 8 dishes)
  //   l. 249  That is 6 extra dishes on top of the table's meals, and the dish
  //           budget above already has room for them.
  // Les repas de la table valent 4. 4 + 6 = 10, et le budget en ouvrait 8.
  assertEquals(budget([ROXANE, LUBNA], 6), 10);
});

Deno.test("③ LE CAS QUI PASSE — une seule bouche divergente ne bouge pas d'un plat", () => {
  // ⛔ TOUTE FUSION EST DANS CE CAS: elle reprend UNE personne, jamais deux. Le
  // budget d'une fusion doit être celui d'avant ce lot, octet pour octet.
  // baseCap = 2 créneaux × 2 jours = 4; la borne du supplément vaut 4 × 1 = 4.
  assertEquals(budget([ROXANE], 4), 8);
  assertEquals(budget([ROXANE], 99), 8, "la borne d'UNE bouche est restée `baseCap`");
  assertEquals(budget([], 99), 8, "une liste vide vaut un plancher de 1, comme avant");
});

Deno.test("③ SANS FUSION NI DIVERGENCE, LA LANE INDIVIDUELLE EST L'IDENTITÉ", () => {
  assertEquals(
    dishBudgetFor({
      scope: "several_days",
      // deno-lint-ignore no-explicit-any
      rhythm: TWO_SLOTS as any,
      daysToFill: 2,
      merge: null,
    }),
    4,
  );
});

Deno.test("③ LA MUTATION — la borne MORD toujours, elle a seulement le bon N", () => {
  // ⛔ CE N'EST PAS « ON A RETIRÉ LE PLAFOND ». Un `dedicatedDishesAsked`
  // aberrant — un appelant qui compterait autre chose que les repas des bouches
  // nommées — ne peut toujours pas ouvrir un budget infini: il est borné par ce
  // que N bouches de plus peuvent manger, c'est-à-dire N × (créneaux × jours).
  assertEquals(budget([ROXANE, LUBNA], 999), 12, "borne = 4 + 4×2");
  assertEquals(budget([ROXANE, LUBNA, "m-3"], 999), 16, "borne = 4 + 4×3");
  // Et le supplément suit toujours le PLUS GRAND des deux (demandé / montré).
  assertEquals(budget([ROXANE, LUBNA], 3, 7), 11, "montré 7 > demandé 3");
});

Deno.test("③ LE BARREAU ① N'OUVRE RIEN, QUEL QUE SOIT LE NOMBRE DE BOUCHES", () => {
  // ⛔ LE POINT LE PLUS IMPORTANT DE CETTE ARITHMÉTIQUE, et il survit au lot:
  // ouvrir un budget que la consigne interdit d'utiliser fait « déborder
  // poliment pour le remplir » — un plan du jeudi qui proposait à manger
  // jusqu'au mercredi d'après.
  const merge: MergedEater = {
    shape: "one_dish",
    ownDishesShown: 9,
    dedicatedDishesAsked: 9,
    dedicatedCells: [],
    dishBearerIds: [ROXANE, LUBNA, "m-3"],
  };
  assertEquals(
    dishBudgetFor({
      scope: "several_days",
      // deno-lint-ignore no-explicit-any
      rhythm: TWO_SLOTS as any,
      daysToFill: 2,
      merge,
    }),
    4,
  );
});
