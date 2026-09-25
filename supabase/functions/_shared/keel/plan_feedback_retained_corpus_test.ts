/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE QUESTIONNAIRE, RÉPONSE PAR RÉPONSE — l'audit du 2ᵉ producteur, en test.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI CE FICHIER EXISTE À CÔTÉ DE `plan_feedback_retained_test.ts` ──
 * L'autre teste des PROPRIÉTÉS (les deux crans, le sujet, le plancher). Celui-
 * ci est un BALAYAGE: chaque jeton de chaque question fermée est coché au moins
 * une fois, et ce qu'il produit est écrit en toutes lettres. C'est l'audit de
 * l'étape 3 du chantier mémoire, rendu exécutable — un audit qu'on relit n'est
 * pas un audit qui tient.
 *
 * ⛔ CE QU'IL PROUVE ET QU'AUCUN AUTRE TEST NE PROUVAIT: qu'aucun jeton n'est
 * DÉCORATIF. Un vocabulaire fermé dont une valeur n'a pas de branche nommée est
 * une valeur qui finit par être pilotée (règle R6 de ce dépôt), et le
 * questionnaire en compte dix-sept.
 *
 * ⚠️ AUCUN MODÈLE N'EST APPELÉ. Le questionnaire répond par des JETONS: il n'y
 * a rien à classer, donc rien à mesurer au banc. C'est toute la différence avec
 * le chemin de la note, et c'est pour ça que celui-ci peut être exhaustif.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  FEEDBACK_QUESTIONS,
  type FeedbackQuestion,
  QUESTION_OPTIONS,
} from "./plan_feedback.ts";
import {
  type PlanFeedbackContext,
  type PlanFeedbackRow,
  retainedItemsFromPlanFeedback,
} from "./plan_feedback_retained.ts";
import type { RetainedKind } from "./retained_item.ts";

const MEMBER = "22222222-2222-4222-8222-222222222222";

const CTX: PlanFeedbackContext = {
  at: "2026-09-21",
  locale: "fr-FR",
  planDishTitles: ["Poulet rôti", "Gratin de courgettes"],
  planFoodTerms: ["poulet", "courgette", "riz", "cabillaud"],
  // Les trois bases sont AU MILIEU de leur échelle, exprès: un test qui ne
  // produit rien ne peut pas se cacher derrière un plancher ou un plafond.
  cookingTimeMin: 45,
  recipeDifficulty: "normal",
  varietyLevel: "some",
};

function row(patch: Partial<PlanFeedbackRow> = {}): PlanFeedbackRow {
  return {
    cooked: null,
    portions: null,
    portionsSubject: null,
    neverAgain: [],
    makeAgain: [],
    difficulty: null,
    speed: null,
    variety: null,
    axisQuestion: null,
    axisAnswer: null,
    dismissedAt: null,
    ...patch,
  };
}

// ===========================================================================
// LE CORPUS DES RÉPONSES
// ===========================================================================

interface Answered {
  /** La question, et le jeton coché. */
  readonly question: FeedbackQuestion;
  readonly answer: string;
  /** Pourquoi ce jeton est là. Une phrase. */
  readonly why: string;
  /** La ligne à passer au producteur. */
  readonly row: PlanFeedbackRow;
  /** Les familles attendues, une par item. `[]` = rien, et c'est une réponse. */
  readonly items: readonly RetainedKind[];
  /** Les champs attendus, un par changement. `[]` = rien. */
  readonly fields: readonly string[];
}

const CORPUS: readonly Answered[] = [
  // ── `cooked` — a-t-elle pu le cuisiner ────────────────────────────────────
  {
    question: "cooked",
    answer: "yes",
    why: "Le plan a été cuisiné: rien ne bouge, et c'est la bonne réponse.",
    row: row({ cooked: "yes" }),
    items: [],
    fields: [],
  },
  {
    question: "cooked",
    answer: "partly",
    why: "À moitié cuisiné: seul, ce jeton ne déclare aucun axe — il ne bouge rien.",
    row: row({ cooked: "partly" }),
    items: [],
    fields: [],
  },
  {
    question: "cooked",
    answer: "no",
    why: "Pas cuisiné: sans axe déclaré non plus, le producteur ne devine pas lequel.",
    row: row({ cooked: "no" }),
    items: [],
    fields: [],
  },

  // ── `portions` — LA SEULE FAMILLE DONT CE PRODUCTEUR EST LE SEUL ─────────
  {
    question: "portions",
    answer: "way_too_much",
    why: "Le cran fort, vers le bas. ⛔ Aucun gramme: `{direction, magnitude}` seuls.",
    row: row({ portions: "way_too_much" }),
    items: ["portion.adjust"],
    fields: [],
  },
  {
    question: "portions",
    answer: "too_much",
    why: "Le cran faible, vers le bas — le sens historique du jeton, jamais remappé.",
    row: row({ portions: "too_much" }),
    items: ["portion.adjust"],
    fields: [],
  },
  {
    question: "portions",
    answer: "right",
    why: "⚠️ LE MILIEU EST UNE RÉPONSE, pas un vide: « c'était juste » ne bouge rien.",
    row: row({ portions: "right" }),
    items: [],
    fields: [],
  },
  {
    question: "portions",
    answer: "not_enough",
    why: "Le cran faible, vers le haut.",
    row: row({ portions: "not_enough" }),
    items: ["portion.adjust"],
    fields: [],
  },
  {
    question: "portions",
    answer: "way_not_enough",
    why: "Le cran fort, vers le haut. Sans lui, `clear` serait inatteignable à la hausse.",
    row: row({ portions: "way_not_enough" }),
    items: ["portion.adjust"],
    fields: [],
  },

  // ── `difficulty` — les recettes ───────────────────────────────────────────
  // ⟳ 2026-09-25 — le champ déplacé est la PLAGE DE TEMPS: la difficulté se
  // déduit de la marge qu'elle laisse au-dessus du minimum du plan.
  {
    question: "difficulty",
    answer: "too_hard",
    why: "Trop dur ⇒ la plage de temps descend d'un cran, il n'y a pas d'item retenu (lot M5).",
    row: row({ cooked: "partly", difficulty: "too_hard" }),
    items: [],
    fields: ["cooking_time_min"],
  },
  {
    question: "difficulty",
    answer: "fine",
    why: "⚠️ Le cran du milieu déclare que le réglage est juste: rien ne bouge.",
    row: row({ cooked: "yes", difficulty: "fine" }),
    items: [],
    fields: [],
  },
  {
    question: "difficulty",
    answer: "could_do_more",
    why: "⛔ LE SENS MONTANT EXISTE. Un champ qui ne descend jamais finit au plancher.",
    row: row({ cooked: "yes", difficulty: "could_do_more" }),
    items: [],
    fields: ["cooking_time_min"],
  },

  // ── `speed` — le temps ────────────────────────────────────────────────────
  {
    question: "speed",
    answer: "too_long",
    why: "Trop long ⇒ le champ `cooking_time_min` descend, avec sa valeur d'avant.",
    row: row({ cooked: "partly", speed: "too_long" }),
    items: [],
    fields: ["cooking_time_min"],
  },
  {
    question: "speed",
    answer: "fine",
    why: "Le milieu, encore: une réponse satisfaite n'écrit rien.",
    row: row({ cooked: "yes", speed: "fine" }),
    items: [],
    fields: [],
  },
  {
    question: "speed",
    answer: "had_more_time",
    why: "Le sens montant du temps.",
    row: row({ cooked: "yes", speed: "had_more_time" }),
    items: [],
    fields: ["cooking_time_min"],
  },

  // ── `enough_variety` — la variété ─────────────────────────────────────────
  {
    question: "enough_variety",
    answer: "yes",
    why: "Assez varié: rien ne bouge.",
    row: row({ cooked: "yes", variety: "yes" }),
    items: [],
    fields: [],
  },
  {
    question: "enough_variety",
    answer: "sometimes",
    why: "« parfois » est une PLAINTE tiède: elle monte le champ d'un cran.",
    row: row({ cooked: "yes", variety: "sometimes" }),
    items: [],
    fields: ["variety"],
  },
  {
    question: "enough_variety",
    answer: "no",
    why: "Pas assez varié: le champ monte.",
    row: row({ cooked: "yes", variety: "no" }),
    items: [],
    fields: ["variety"],
  },

  // ── `never_again` / `make_again` — les deux questions d'aliment ───────────
  {
    question: "never_again",
    answer: "none",
    why: "⚠️ « AUCUN » EST UNE RÉPONSE, pas une absence de réponse.",
    row: row({ cooked: "yes", neverAgain: ["none"] }),
    items: [],
    fields: [],
  },
  {
    question: "never_again",
    answer: "poulet",
    why: "Un aliment DU PLAN ⇒ `food.exclude`, et son sujet est celui qu'on a demandé.",
    row: row({
      cooked: "yes",
      neverAgain: [{ food: "poulet", subject: `member:${MEMBER}` }],
    }),
    items: ["food.exclude"],
    fields: [],
  },
  {
    question: "never_again",
    answer: "kiwi",
    why:
      "⛔ UN ALIMENT HORS DU PLAN N'ENTRE PAS. Ce n'est pas un matcher: c'est " +
      "l'appartenance EXACTE à la liste que l'écran a proposée.",
    row: row({ cooked: "yes", neverAgain: [{ food: "kiwi", subject: "household" }] }),
    items: [],
    fields: [],
  },
  {
    question: "make_again",
    answer: "none",
    why: "Le même « aucun », sur l'autre question.",
    row: row({ cooked: "yes", makeAgain: ["none"] }),
    items: [],
    fields: [],
  },
  {
    question: "make_again",
    answer: "riz",
    why: "Un aliment du plan, dans l'autre sens ⇒ `food.prefer`.",
    row: row({ cooked: "yes", makeAgain: [{ food: "riz", subject: "household" }] }),
    items: ["food.prefer"],
    fields: [],
  },

  // ── LE REFUS — il est une réponse, et sa traduction est « rien » ──────────
  {
    question: "anything_else",
    answer: "",
    why:
      "⚠️ FERMER LE QUESTIONNAIRE N'EST PAS « je n'aime rien », c'est « pas " +
      "maintenant ». Rien n'est produit, et le refus est COMPTÉ.",
    row: row({ portions: "too_much", dismissedAt: "2026-09-21T20:40:00.000Z" }),
    items: [],
    fields: [],
  },
];

// ===========================================================================
// LE BALAYAGE
// ===========================================================================

for (const c of CORPUS) {
  Deno.test(`questionnaire — ${c.question} = ${c.answer || "(fermé)"}`, () => {
    const out = retainedItemsFromPlanFeedback(c.row, CTX);
    assertEquals(
      out.items.map((i) => i.kind).slice().sort(),
      c.items.slice().sort(),
      `${c.question}=${c.answer} — ${c.why}`,
    );
    assertEquals(
      out.fieldChanges.map((f) => String(f.field)).slice().sort(),
      c.fields.slice().sort(),
      `${c.question}=${c.answer} — ${c.why}`,
    );
  });
}

// ===========================================================================
// CE QUE LE BALAYAGE DOIT COUVRIR
// ===========================================================================

/**
 * Les questions dont les options sont DYNAMIQUES (les aliments du plan) ou
 * libres. Elles ne se balaient pas par leur vocabulaire — elles ont leurs
 * propres cas ci-dessus, nommés.
 */
const NOT_A_CLOSED_LIST: readonly FeedbackQuestion[] = [
  "never_again",
  "make_again",
  "anything_else",
];

Deno.test("audit — chaque jeton de chaque question fermée est coché au moins une fois", () => {
  // ⛔ LA GARDE R6 DU DÉPÔT, APPLIQUÉE AU QUESTIONNAIRE: aucune valeur
  // d'énumération sans branche nommée. Un jeton que personne ne coche dans ce
  // fichier est un jeton dont plus personne ne sait ce qu'il produit.
  const cocked = new Set(CORPUS.map((c) => `${c.question}|${c.answer}`));
  const missing: string[] = [];
  for (const question of FEEDBACK_QUESTIONS) {
    if (NOT_A_CLOSED_LIST.includes(question)) continue;
    for (const option of QUESTION_OPTIONS[question]) {
      if (!cocked.has(`${question}|${option}`)) missing.push(`${question}=${option}`);
    }
  }
  assertEquals(missing, [], `jetons jamais cochés: ${missing.join(", ")}`);
});

Deno.test("audit — chaque cas du balayage dit pourquoi il est là", () => {
  for (const c of CORPUS) {
    assert(c.why.trim() !== "", `${c.question}=${c.answer}: aucune raison écrite`);
  }
});

Deno.test("audit — le questionnaire ne produit AUCUN moment, et c'est écrit", () => {
  // ⛔ LE TROU NOMMÉ. `rhythm.set` est AUTORISÉ à ce producteur par la matrice,
  // et il n'en produit aucun: AUCUNE question ne porte sur un moment de la
  // journée. Ce test ne réclame pas la question — il épingle l'absence, pour
  // qu'ajouter un moment au questionnaire soit une décision et pas un effet de
  // bord. ⚠️ La note de brouillon, elle, DOIT porter le moment: c'est le
  // défaut mesuré le 2026-09-21, et il se répare de l'autre côté.
  for (const c of CORPUS) {
    const out = retainedItemsFromPlanFeedback(c.row, CTX);
    for (const item of out.items) {
      assert(
        item.kind !== "rhythm.set",
        `${c.question}=${c.answer} produit un rythme, qu'aucune question ne demande`,
      );
      const occasion = (item as { occasion?: unknown }).occasion ?? null;
      assertEquals(
        occasion,
        null,
        `${c.question}=${c.answer}: un moment sorti d'une question qui n'en pose aucune`,
      );
    }
  }
});

Deno.test("audit — la part retenue porte le sujet DEMANDÉ, jamais un repli", () => {
  // Le questionnaire est le SEUL producteur de `portion.adjust`, et la seule
  // porte où le sujet est demandé à la personne. Un repli sur `household`
  // retirerait de la nourriture à toute la table.
  const forHer = retainedItemsFromPlanFeedback(
    row({ portions: "too_much", portionsSubject: `member:${MEMBER}` }),
    CTX,
  );
  assertEquals(forHer.items.length, 1);
  assertEquals(forHer.items[0].subject, `member:${MEMBER}`);

  const forTable = retainedItemsFromPlanFeedback(row({ portions: "too_much" }), CTX);
  assertEquals(forTable.items.length, 1);
  assertEquals(forTable.items[0].subject, "household");
});

Deno.test("audit — une réponse citée l'est par la QUESTION et la RÉPONSE", () => {
  // Lot M2: le questionnaire répond par des jetons. Citer le jeton ne citerait
  // personne; citer la seule réponse ne dirait pas trop de QUOI.
  const out = retainedItemsFromPlanFeedback(row({ portions: "too_much" }), CTX);
  const quote = out.items[0].quote ?? "";
  assert(quote.includes("→"), `la citation ne porte pas le couple: ${quote}`);
  assert(quote.trim() !== "", "une ligne serveur non citée");
});
