import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@^1.0.0";

import {
  buildMealPrompt,
  MEAL_SYSTEM_PROMPT,
  SOLO_BOX_BLOCK,
} from "./meal_generation.ts";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LES CONTENANTS D'UNE PERSONNE SEULE — 2026-09-01.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL ──────────────────────────────────
 *     « je viens de créer un plan en mode solo et il n'y a pas l'histoire des
 *       barquettes »
 *
 * Vérifié en base avant d'écrire une ligne: le dernier plan solo
 * (`96e9a7a2-…`) porte QUATRE plats et `with_box: 0`; le dernier plan foyer
 * (`367f2f65-…`), trois plats et DEUX contenants. La lane individuelle passait
 * `boxMemberIds: []`, ce qui fermait tout le protocole.
 *
 * ⛔ ET C'ÉTAIT UNE DÉCISION ÉCRITE, pas un oubli — le commentaire disait « une
 * personne seule a bien des boîtes dans sa vraie cuisine; ce qu'elle n'a pas,
 * c'est deux bouches à départager ». Juste sur le PROTOCOLE, faux sur le
 * PRODUIT: ce que la personne lit — « dimanche, tu remplis quatre barquettes,
 * voilà ce qu'il y a dedans » — ne dépend pas du nombre de bouches.
 */

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
  daysToFill: ["mon", "tue", "wed"],
  cookDays: [],
  cookingTimeMin: 60,
  kitchenEquipment: null,
};

Deno.test("la lane FOYER garde son prompt système, au caractère près", () => {
  // ⛔ LA GARDE QUI REND LE LOT ADDITIF. Deux protocoles de boîte dans le même
  // message — l'un nommant des bouches, l'autre déclarant qu'il n'y en a pas —
  // serait la pire sortie possible.
  assertEquals(
    buildMealPrompt({ ...PROMPT_BASE }).systemPrompt,
    MEAL_SYSTEM_PROMPT,
  );
});

Deno.test("la lane SOLO reçoit le bloc, et il s'ajoute sans rien retirer", () => {
  const sys = buildMealPrompt({ ...PROMPT_BASE, soloBoxes: true }).systemPrompt;
  assertStringIncludes(sys, MEAL_SYSTEM_PROMPT);
  assertStringIncludes(sys, "== ONE CONTAINER PER PORTION PUT ASIDE ==");
  assertStringIncludes(sys, SOLO_BOX_BLOCK);
});

Deno.test("⛔ LE BLOC SOLO NE NOMME AUCUNE BOUCHE", () => {
  // ══════════════════════════════════════════════════════════════════════
  // C'EST LA MOITIÉ QUI COMPTE, ET C'EST LE MOTIF POUR LEQUEL LA LANE
  // N'AVAIT RIEN.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Servir un bloc qui nomme des bouches à quelqu'un qui mange seul lui
  // apprendrait qu'un marquage par personne existe et l'inviterait à en
  // inventer un — le raisonnement de `dishOwnerSchemaBlock`, mesuré. Ici le
  // couvercle n'a pas de nom parce qu'il n'y a personne à distinguer, et le
  // bloc le DIT au lieu de le taire.
  assert(!SOLO_BOX_BLOCK.includes("member_id"), SOLO_BOX_BLOCK);
  assert(!SOLO_BOX_BLOCK.includes("member_ids"), SOLO_BOX_BLOCK);
  assertStringIncludes(SOLO_BOX_BLOCK, "no");
  assertStringIncludes(SOLO_BOX_BLOCK, "lid carries a name");
});

Deno.test("le bloc dit LE COMPTE, LE CONTENU et LES DEUX EXCLUSIONS", () => {
  // Un contenant par plat qui puise…
  assertStringIncludes(SOLO_BOX_BLOCK, "Exactly ONE box per dish that draws on a preparation");
  // …ce qu'on met dedans, en grammes de PRÊT (pas de cru: c'est la confusion
  // que le protocole foyer a déjà payée)…
  assertStringIncludes(SOLO_BOX_BLOCK, "READY food");
  assertStringIncludes(SOLO_BOX_BLOCK, "not the raw weight");
  // …un seul bac pour tout le repas, pas un par casserole…
  assertStringIncludes(SOLO_BOX_BLOCK, "not one tub per pan");
  // …et rien du tout pour un plat cuisiné le jour même.
  assertStringIncludes(SOLO_BOX_BLOCK, "has no \"boxes\"");
});

Deno.test("⛔ AUCUNE TOURNURE PERMISSIVE — mesurée à zéro sur douze runs", () => {
  // « may carry » a été mesuré le 2026-08-17 comme une permission qu'on
  // décline: zéro déclaration sur douze runs. Le bloc foyer l'interdit, et un
  // test de son fichier tient la règle; celui-ci la tient ici.
  for (const weasel of ["may carry", "you can add", "if you want", "optionally"]) {
    assert(!SOLO_BOX_BLOCK.toLowerCase().includes(weasel), weasel);
  }
});

// ---------------------------------------------------------------------------
// LA MOITIÉ « CONSIGNE » — celle sans laquelle le schéma reste à zéro
// ---------------------------------------------------------------------------

Deno.test("⛔ LE SCHÉMA NE SUFFIT PAS — il lui faut son ORDRE dans le message", () => {
  // ══════════════════════════════════════════════════════════════════════
  // MESURÉ SUR LE RUN RÉEL `2235786d-…`, PLAN SOLO DE SEPT JOURS.
  // ══════════════════════════════════════════════════════════════════════
  //
  //     « 17 meals take from a batch and NOT ONE carries a box --
  //       17 containers were owed, zero came back »
  //
  // Le premier passage n'avait servi que le SCHÉMA (prompt système). C'est
  // exactement ce que `boxSchemaBlock` annonce dans sa propre définition:
  // `member_portions` a les DEUX moitiés et il est rempli 100 % du temps;
  // `for_member_id` n'avait que le schéma et il est resté à zéro sur douze
  // générations. Un schéma dit qu'une clé EXISTE; il ne dit pas de l'écrire.
  const msg = buildMealPrompt({ ...PROMPT_BASE, soloBoxes: true }).userMessage;
  assertStringIncludes(msg, "-- WEIGH IT ONCE, INTO CONTAINERS NAMED BY MEAL --");
  assertStringIncludes(msg, "Count them before you answer");
  // Le contenant est celui du REPAS, pas de la casserole.
  assertStringIncludes(msg, "not one tub per pan");
  // Et rien pour un plat cuisiné le jour même.
  assertStringIncludes(msg, 'has no "boxes"');
});

Deno.test("la consigne redit qu'aucun couvercle ne porte de nom", () => {
  // Elle est dans les DEUX moitiés, et c'est voulu: c'est la seule chose que le
  // modèle pourrait emprunter au protocole foyer, qu'il connaît par ailleurs.
  const msg = buildMealPrompt({ ...PROMPT_BASE, soloBoxes: true }).userMessage;
  assertStringIncludes(msg, "no lid carries a name");
  assert(!msg.includes("member_ids"), "des noms de bouche sur la lane solo");
});

Deno.test("sans l'option, le message n'en parle PAS", () => {
  const msg = buildMealPrompt({ ...PROMPT_BASE }).userMessage;
  assert(!msg.includes("WEIGH IT ONCE"), msg.slice(0, 200));
});

// ---------------------------------------------------------------------------
// LA SOURCE — chaque lane DIT ce qu'elle veut
// ---------------------------------------------------------------------------

Deno.test("la lane solo réclame les contenants, la lane foyer les refuse", async () => {
  const solo = await Deno.readTextFile(
    new URL("../../generate-meal-v1/index.ts", import.meta.url),
  );
  const foyer = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  // Deux sites chacune: le prompt et le parseur. Un seul câblé donnerait soit
  // une consigne dont la sortie est refusée, soit un parseur qui accepte des
  // bacs que rien n'a demandés.
  assertEquals((solo.match(/^\s+soloBoxes: true,$/gm) ?? []).length, 2);
  assertEquals((foyer.match(/^\s+soloBoxes: false,$/gm) ?? []).length, 2);
  // ⛔ ET LE MOTIF HISTORIQUE A ÉTÉ RETIRÉ, pas laissé à côté du contraire.
  assert(
    !solo.includes("le protocole des boîtes n'existe que pour ça"),
    "le commentaire qui justifiait l'absence survit à sa cause",
  );
});
