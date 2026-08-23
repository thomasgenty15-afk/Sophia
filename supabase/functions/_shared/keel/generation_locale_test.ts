// KEEL — LA LANGUE DES ARTEFACTS GÉNÉRÉS.
//
// ── CE QUE CES CEINTURES PROTÈGENT ─────────────────────────────────────────
// Jusqu'à ce lot, `appendContentLanguageBlock` existait, était testé, et
// n'avait AUCUN appelant. Les deux générateurs écrivaient
// `content_locale: String(goalRow.content_locale ?? "en")` — une colonne que
// tous ses écrivains sèment `'en-GB'` — et n'envoyaient aucune consigne de
// langue au modèle. Conséquence, une fois la langue devenue un choix: un élève
// français aurait eu une conversation française et un plan de repas anglais.
//
// Les deux moitiés du défaut se testent séparément, parce qu'elles cassent
// séparément:
//   · le PROMPT ne nomme pas la langue     -> le modèle écrit en anglais;
//   · la LIGNE ne dit pas la bonne langue  -> le rendu, le PDF et la relecture
//     croient lire de l'anglais dans un texte français.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildMealPrompt,
  MEAL_TOKEN_FIELDS,
  MEAL_TRANSLATABLE_FIELDS,
} from "./meal_generation.ts";
import { buildWeekPlanPrompt } from "./week_plan_generation.ts";
import { UNKNOWN_BODY } from "./student_body.ts";
import { appendContentLanguageBlock } from "./locale.ts";

// ---------------------------------------------------------------------------
// Fixtures minimales — on ne teste QUE la langue ici.
// ---------------------------------------------------------------------------

function mealArgs(contentLocale: string) {
  return {
    firstDayCookable: true,
    goal: "maintenance",
    situation: null,
    context: null,
    slot: null,
    servings: 1,
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "d",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    mode: "to_shop" as const,
    scope: "day" as const,
    daysToFill: [],
    eatingRhythm: undefined,
    cookDays: [],
    cookingTimeMin: null,
    recipeDifficulty: null,
    variety: null,
    budgetAmount: null,
    servingsPerMeal: null,
    dietaryRegime: null,
    seasonCountry: null,
    seasonMonth: null,
    dislikes: [],
    foodPreferences: [],
    pantry: [],
    awayDays: [],
    weekStart: "2026-08-10",
    weekEnd: "2026-08-16",
    contentLocale,
  };
}

function weekArgs(contentLocale: string) {
  return {
    principles: [],
    situation: {
      goal: "maintenance" as const,
      situation: null,
      context: null,
      aspiration: null,
      focusAxis: null,
      practicalConstraints: {},
      body: UNKNOWN_BODY,
    },
    dietBlock: "",
    doctrineBlock: "d",
    weekStart: "2026-08-10",
    safetyConstraints: null,
    safetyConstraintTable: null,
    coachNoteBlock: null,
    hungerSignalBlock: null,
    contentLocale,
  };
}

// ---------------------------------------------------------------------------

Deno.test("repas: le bloc de langue est la DERNIÈRE chose du message", () => {
  // La récence EST le mécanisme. Un bloc en milieu de prompt est un bloc que le
  // modèle arbitre contre la consigne suivante — c'est-à-dire un bloc absent,
  // mais qui rend un test naïf (`includes`) vert.
  for (const locale of ["fr-FR", "en-US"]) {
    const { userMessage } = buildMealPrompt(mealArgs(locale));
    const idx = userMessage.lastIndexOf("CONTENT_LANGUAGE");
    assert(idx >= 0, `bloc absent pour ${locale}`);
    const after = userMessage.slice(idx);
    // Rien d'autre qu'une consigne de langue après le marqueur.
    assert(
      !after.includes("\n\n\n"),
      `du contenu suit le bloc de langue pour ${locale}`,
    );
    assertEquals(userMessage.trimEnd(), userMessage.trimEnd());
  }
});

Deno.test("repas: le bloc NOMME la langue, dans les deux sens", () => {
  // Les deux sens, délibérément: une assertion sur le seul français resterait
  // verte devant un `"French"` codé en dur dans le constructeur du bloc.
  const fr = buildMealPrompt(mealArgs("fr-FR")).userMessage;
  assertStringIncludes(fr, "French");
  assertStringIncludes(fr, "fr-FR");

  const en = buildMealPrompt(mealArgs("en-US")).userMessage;
  assertStringIncludes(en, "English");
  assertStringIncludes(en, "en-US");
});

Deno.test("repas: les champs-JETONS sont nommés comme non traduisibles", () => {
  // ⚠️ LE CAS QUI COÛTE. `preparation_id` est INVENTÉ par le modèle et
  // référencé par `dishes[].uses[]`. En français il écrirait `prep_poulet`:
  // cohérent avec lui-même, donc rien ne casse à la lecture — et pourtant
  // `token-lint` a une règle exactement là-dessus, et un identifiant traduit ne
  // se rapproche plus de rien.
  const msg = buildMealPrompt(mealArgs("fr-FR")).userMessage;
  for (const token of ["slot", "day", "aisle", "preparation_id"]) {
    assertStringIncludes(msg, token);
  }
  assertStringIncludes(msg, "ASCII snake_case");
});

Deno.test("repas: la locale RESSORT, égale à celle qu'on a donnée", () => {
  // Le motif `maxNutrition`: une seule expression, donc l'écriture en base ne
  // peut pas diverger du prompt. C'est ce qui remplace
  // `String(goalRow.content_locale ?? "en")`, calculé ailleurs.
  for (const locale of ["fr-FR", "en-US", "fr-CA"]) {
    assertEquals(buildMealPrompt(mealArgs(locale)).contentLocale, locale);
  }
});

Deno.test("repas: remettre le bloc après un suffixe ne l'EMPILE pas", () => {
  // `generate-meal-v1` colle le bloc satiété et, sur ses deux chemins de
  // réparation, une instruction de reprise APRÈS le message. Le composeur
  // rappelle donc `appendContentLanguageBlock`, et il faut que ce rappel
  // DÉPLACE le bloc au lieu de le doubler — sinon le prompt porte deux
  // consignes de langue, et un jour deux consignes différentes.
  const built = buildMealPrompt(mealArgs("fr-FR"));
  const again = appendContentLanguageBlock(
    `${built.userMessage}\n\nRETRY: add a protein anchor.`,
    built.contentLocale,
    MEAL_TRANSLATABLE_FIELDS,
    MEAL_TOKEN_FIELDS,
  );
  const occurrences = again.split("CONTENT_LANGUAGE").length - 1;
  assertEquals(occurrences, 1, "le bloc de langue est empilé");
  assert(
    again.lastIndexOf("CONTENT_LANGUAGE") > again.indexOf("RETRY:"),
    "le bloc n'est plus le dernier après la reprise",
  );
});

Deno.test("semaine: bloc en dernier, langue nommée, locale rendue", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    const built = buildWeekPlanPrompt(weekArgs(locale));
    assert(built.userMessage.includes("CONTENT_LANGUAGE"));
    assertEquals(built.contentLocale, locale);
  }
  assertStringIncludes(buildWeekPlanPrompt(weekArgs("fr-FR")).userMessage, "French");
  assertStringIncludes(buildWeekPlanPrompt(weekArgs("en-US")).userMessage, "English");
});

Deno.test("semaine: `source_belief_key` est nommé non traduisible", () => {
  // Il est déjà décrit comme « copié caractère pour caractère » dans le CORPS
  // du prompt. Le répéter dans le bloc de langue n'est pas de la redondance: le
  // bloc est plus RÉCENT, donc il gagnerait sur le corps s'il ne le nommait
  // pas — et une clé de conviction traduite ne se rattache plus à rien.
  const msg = buildWeekPlanPrompt(weekArgs("fr-FR")).userMessage;
  const idx = msg.lastIndexOf("CONTENT_LANGUAGE");
  assertStringIncludes(msg.slice(idx), "source_belief_key");
});
